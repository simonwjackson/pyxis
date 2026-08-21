//! Account-scoped persistence over a single ProseQL runtime.
//!
//! One runtime owns the store file, and the engine documents that multiple runtimes over
//! one path are unsupported. The process-level instance lock in U4 is what enforces that;
//! this module assumes it.
//!
//! Account isolation is enforced here rather than left to callers. Every scoped read
//! checks the record's `accountId` against the requested scope, and every scoped list
//! filters by it. A caller holding an id from another account gets `None`, not a record.

use std::path::{Path, PathBuf};

use proseql_engine::errors::{EngineError, OperationError};
use proseql_native::{NativeCollectionConfig, NativeRuntime, NativeRuntimeConfig};
use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::{Map, Value};

use super::schema;

/// The account a scoped operation applies to. A newtype so an account id cannot be passed
/// where a record id is expected.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct AccountId(String);

impl AccountId {
    pub fn new(id: impl Into<String>) -> Self {
        AccountId(id.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("store engine error: {0}")]
    Engine(String),
    #[error("record in collection '{collection}' could not be decoded: {message}")]
    Decode { collection: String, message: String },
    #[error("record in collection '{collection}' must be a JSON object")]
    NotAnObject { collection: String },
}

type Result<T> = std::result::Result<T, StoreError>;

fn engine(error: EngineError) -> StoreError {
    StoreError::Engine(error.to_string())
}

fn operation(reason: &str, message: String) -> EngineError {
    EngineError::Operation(OperationError {
        operation: "store".into(),
        reason: reason.into(),
        message,
    })
}

#[derive(Clone)]
pub struct Store {
    runtime: NativeRuntime,
}

impl Store {
    /// Open the store beneath a state directory, creating it when absent.
    pub fn open(state_dir: &Path) -> Result<Self> {
        let path = Self::path_for(state_dir);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|error| StoreError::Engine(error.to_string()))?;
        }

        let runtime = NativeRuntime::open(NativeRuntimeConfig {
            path: path.to_string_lossy().into_owned(),
            collections: schema::all()
                .into_iter()
                .map(NativeCollectionConfig::new)
                .collect(),
        })
        .map_err(engine)?;

        Ok(Store { runtime })
    }

    pub fn path_for(state_dir: &Path) -> PathBuf {
        state_dir.join("db").join("pyxis.yaml")
    }

    pub fn close(&self) -> Result<()> {
        self.runtime.close().map_err(engine)
    }

    // ---- unscoped: accounts only -------------------------------------------------

    pub fn put_account<T: Serialize>(&self, id: &str, record: &T) -> Result<()> {
        let value = to_object(schema::ACCOUNTS, record)?;
        self.upsert(schema::ACCOUNTS, id, value)
    }

    pub fn get_account<T: DeserializeOwned>(&self, id: &str) -> Result<Option<T>> {
        let found = self
            .runtime
            .find_by_id(schema::ACCOUNTS, id)
            .map_err(engine)?;
        found
            .map(|value| decode(schema::ACCOUNTS, value))
            .transpose()
    }

    pub fn list_accounts<T: DeserializeOwned>(&self) -> Result<Vec<T>> {
        self.collect(schema::ACCOUNTS)?
            .into_iter()
            .map(|value| decode(schema::ACCOUNTS, value))
            .collect()
    }

    // ---- scoped: every other collection ------------------------------------------

    /// Write a record into an account's scope. The `accountId` field is set here, so a
    /// caller cannot write a record into the wrong account by forgetting it.
    pub fn put<T: Serialize>(
        &self,
        collection: &str,
        account: &AccountId,
        id: &str,
        record: &T,
    ) -> Result<()> {
        let mut value = to_object(collection, record)?;
        if let Value::Object(fields) = &mut value {
            fields.insert("id".into(), Value::String(id.to_string()));
            fields.insert("accountId".into(), Value::String(account.as_str().into()));
        }
        self.upsert(collection, id, value)
    }

    /// Read a record from an account's scope. A record belonging to another account reads
    /// as absent rather than leaking across the boundary.
    pub fn get<T: DeserializeOwned>(
        &self,
        collection: &str,
        account: &AccountId,
        id: &str,
    ) -> Result<Option<T>> {
        let Some(value) = self.runtime.find_by_id(collection, id).map_err(engine)? else {
            return Ok(None);
        };
        if !belongs_to(&value, account) {
            return Ok(None);
        }
        Ok(Some(decode(collection, value)?))
    }

    pub fn list<T: DeserializeOwned>(
        &self,
        collection: &str,
        account: &AccountId,
    ) -> Result<Vec<T>> {
        self.collect(collection)?
            .into_iter()
            .filter(|value| belongs_to(value, account))
            .map(|value| decode(collection, value))
            .collect()
    }

    /// Delete a record from an account's scope. Deleting another account's id is a no-op.
    pub fn delete(&self, collection: &str, account: &AccountId, id: &str) -> Result<bool> {
        let collection_name = collection.to_string();
        let account_id = account.clone();
        let id = id.to_string();

        self.runtime
            .mutate(move |database| {
                let Some(existing) = database.find_by_id(&collection_name, &id)? else {
                    return Ok(false);
                };
                if !belongs_to(&existing, &account_id) {
                    return Ok(false);
                }
                database.delete(&collection_name, &id)?;
                Ok(true)
            })
            .map_err(engine)
    }

    // ---- internals ----------------------------------------------------------------

    fn upsert(&self, collection: &str, id: &str, value: Value) -> Result<()> {
        let collection_name = collection.to_string();
        let id = id.to_string();

        self.runtime
            .mutate(move |database| {
                if database.find_by_id(&collection_name, &id)?.is_some() {
                    let updates = match &value {
                        Value::Object(fields) => {
                            let mut updates = fields.clone();
                            updates.remove("id");
                            Value::Object(updates)
                        }
                        other => other.clone(),
                    };
                    database.update(&collection_name, &id, updates)?;
                } else {
                    let mut fields = match value {
                        Value::Object(fields) => fields,
                        _ => Map::new(),
                    };
                    fields.insert("id".into(), Value::String(id.clone()));
                    database.create(&collection_name, Value::Object(fields))?;
                }
                Ok(())
            })
            .map_err(engine)
    }

    fn collect(&self, collection: &str) -> Result<Vec<Value>> {
        let name = collection.to_string();
        self.runtime
            .read(move |database| {
                let handle = database.collection(&name).ok_or_else(|| {
                    operation("unknown-collection", format!("unknown collection '{name}'"))
                })?;
                Ok(handle.list().into_iter().cloned().collect::<Vec<_>>())
            })
            .map_err(engine)
    }
}

fn belongs_to(value: &Value, account: &AccountId) -> bool {
    value
        .get("accountId")
        .and_then(Value::as_str)
        .is_some_and(|id| id == account.as_str())
}

fn to_object<T: Serialize>(collection: &str, record: &T) -> Result<Value> {
    let value = serde_json::to_value(record).map_err(|error| StoreError::Decode {
        collection: collection.to_string(),
        message: error.to_string(),
    })?;
    if !value.is_object() {
        return Err(StoreError::NotAnObject {
            collection: collection.to_string(),
        });
    }
    Ok(value)
}

fn decode<T: DeserializeOwned>(collection: &str, value: Value) -> Result<T> {
    serde_json::from_value(value).map_err(|error| StoreError::Decode {
        collection: collection.to_string(),
        message: error.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct AlbumRecord {
        id: String,
        account_id: String,
        title: String,
        artist: String,
        placement: String,
        placement_updated_at: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        year: Option<u32>,
        added_at: String,
        revision: u64,
        updated_by: String,
        updated_at: String,
    }

    fn album(title: &str) -> AlbumRecord {
        AlbumRecord {
            id: String::new(),
            account_id: String::new(),
            title: title.to_string(),
            artist: "Boards of Canada".into(),
            placement: "discovery".into(),
            placement_updated_at: "2026-08-21T00:00:00Z".into(),
            year: Some(1998),
            added_at: "2026-08-21T00:00:00Z".into(),
            revision: 1,
            updated_by: "device-a".into(),
            updated_at: "2026-08-21T00:00:00Z".into(),
        }
    }

    fn temp_store() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().expect("temp dir");
        let store = Store::open(dir.path()).expect("open store");
        (dir, store)
    }

    #[test]
    fn writes_and_reads_back_within_one_account() {
        let (_dir, store) = temp_store();
        let account = AccountId::new("acct-1");

        store
            .put(
                schema::ALBUMS,
                &account,
                "album-1",
                &album("Music Has the Right"),
            )
            .expect("put");

        let found: Option<AlbumRecord> =
            store.get(schema::ALBUMS, &account, "album-1").expect("get");

        assert_eq!(found.expect("record").title, "Music Has the Right");
    }

    #[test]
    fn put_stamps_the_scope_so_callers_cannot_misfile_a_record() {
        let (_dir, store) = temp_store();
        let account = AccountId::new("acct-1");

        store
            .put(schema::ALBUMS, &account, "album-1", &album("Geogaddi"))
            .expect("put");

        let found: AlbumRecord = store
            .get(schema::ALBUMS, &account, "album-1")
            .expect("get")
            .expect("record");

        assert_eq!(found.account_id, "acct-1");
        assert_eq!(found.id, "album-1");
    }

    #[test]
    fn one_account_cannot_read_another_accounts_record_by_id() {
        let (_dir, store) = temp_store();
        let mine = AccountId::new("acct-1");
        let theirs = AccountId::new("acct-2");

        store
            .put(schema::ALBUMS, &mine, "album-1", &album("Geogaddi"))
            .expect("put");

        let leaked: Option<AlbumRecord> =
            store.get(schema::ALBUMS, &theirs, "album-1").expect("get");

        assert!(leaked.is_none());
    }

    #[test]
    fn identically_titled_albums_in_two_accounts_do_not_collide() {
        let (_dir, store) = temp_store();
        let first = AccountId::new("acct-1");
        let second = AccountId::new("acct-2");

        store
            .put(schema::ALBUMS, &first, "a", &album("Geogaddi"))
            .expect("put first");
        store
            .put(schema::ALBUMS, &second, "b", &album("Geogaddi"))
            .expect("put second");

        let first_albums: Vec<AlbumRecord> = store.list(schema::ALBUMS, &first).expect("list");
        let second_albums: Vec<AlbumRecord> = store.list(schema::ALBUMS, &second).expect("list");

        assert_eq!(first_albums.len(), 1);
        assert_eq!(second_albums.len(), 1);
        assert_eq!(first_albums[0].id, "a");
        assert_eq!(second_albums[0].id, "b");
    }

    #[test]
    fn deleting_another_accounts_record_is_a_no_op() {
        let (_dir, store) = temp_store();
        let mine = AccountId::new("acct-1");
        let theirs = AccountId::new("acct-2");

        store
            .put(schema::ALBUMS, &mine, "album-1", &album("Geogaddi"))
            .expect("put");

        let removed = store
            .delete(schema::ALBUMS, &theirs, "album-1")
            .expect("delete");
        let survivor: Option<AlbumRecord> =
            store.get(schema::ALBUMS, &mine, "album-1").expect("get");

        assert!(!removed);
        assert!(survivor.is_some());
    }

    #[test]
    fn records_survive_reopening_the_store() {
        let dir = tempfile::tempdir().expect("temp dir");
        let account = AccountId::new("acct-1");

        {
            let store = Store::open(dir.path()).expect("open");
            store
                .put(
                    schema::ALBUMS,
                    &account,
                    "album-1",
                    &album("Campfire Headphase"),
                )
                .expect("put");
            store.close().expect("close");
        }

        let reopened = Store::open(dir.path()).expect("reopen");
        let found: Option<AlbumRecord> = reopened
            .get(schema::ALBUMS, &account, "album-1")
            .expect("get");

        assert_eq!(found.expect("record").title, "Campfire Headphase");
    }

    #[test]
    fn updating_an_existing_record_replaces_it_rather_than_duplicating() {
        let (_dir, store) = temp_store();
        let account = AccountId::new("acct-1");

        store
            .put(schema::ALBUMS, &account, "album-1", &album("Geogaddi"))
            .expect("first put");

        let mut revised = album("Geogaddi");
        revised.placement = "collection".into();
        revised.revision = 2;
        store
            .put(schema::ALBUMS, &account, "album-1", &revised)
            .expect("second put");

        let all: Vec<AlbumRecord> = store.list(schema::ALBUMS, &account).expect("list");

        assert_eq!(all.len(), 1);
        assert_eq!(all[0].placement, "collection");
        assert_eq!(all[0].revision, 2);
    }

    #[test]
    fn a_corrupt_record_surfaces_a_typed_decode_error_rather_than_panicking() {
        let (_dir, store) = temp_store();
        let account = AccountId::new("acct-1");

        store
            .put(schema::ALBUMS, &account, "album-1", &album("Geogaddi"))
            .expect("put");

        #[derive(Debug, Deserialize)]
        struct Incompatible {
            #[allow(dead_code)]
            title: u64,
        }

        let error = store
            .get::<Incompatible>(schema::ALBUMS, &account, "album-1")
            .expect_err("decode should fail");

        assert!(matches!(error, StoreError::Decode { .. }));
    }

    #[test]
    fn listing_an_empty_account_returns_no_records() {
        let (_dir, store) = temp_store();

        let all: Vec<AlbumRecord> = store
            .list(schema::ALBUMS, &AccountId::new("nobody"))
            .expect("list");

        assert!(all.is_empty());
    }
}
