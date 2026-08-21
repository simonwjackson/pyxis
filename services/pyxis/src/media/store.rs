//! Checksummed local media files and bounded eviction.
//!
//! Imports copy into a same-directory temporary file and rename only after hashing, so a
//! crash never leaves a partial path that looks ready. Every access rechecks the checksum;
//! a mismatch moves the bytes out of the serving tree and marks the record quarantined.

use std::collections::BTreeSet;
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};

use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use ulid::Ulid;

use crate::db::schema;
use crate::db::store::{AccountId, Store, StoreError};

#[derive(Debug, thiserror::Error)]
pub enum MediaStoreError {
    #[error(transparent)]
    Store(#[from] StoreError),
    #[error("media file I/O failed: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MediaFileStatus {
    Ready,
    Quarantined,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MediaFileRecord {
    id: String,
    account_id: String,
    path: String,
    bytes: u64,
    checksum: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    format: Option<String>,
    last_accessed_at: String,
    pinned: bool,
    status: MediaFileStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    quarantined_at: Option<String>,
    revision: u64,
    updated_by: String,
    updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImportedMediaFile {
    pub id: String,
    pub absolute_path: PathBuf,
    pub bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReadyMediaFile {
    pub id: String,
    pub absolute_path: PathBuf,
    pub bytes: u64,
    pub format: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Eviction {
    pub removed_media_file_ids: Vec<String>,
    pub bytes_after: u64,
}

#[derive(Clone)]
pub struct LocalMediaStore {
    store: Store,
    root: PathBuf,
}

impl LocalMediaStore {
    pub fn open(store: Store) -> Result<Self, MediaStoreError> {
        let root = store.state_dir().join("media");
        fs::create_dir_all(root.join("quarantine"))?;
        Ok(LocalMediaStore { store, root })
    }

    pub fn import(
        &self,
        account: &AccountId,
        source: &Path,
        format: Option<String>,
        pinned: bool,
        updated_by: &str,
    ) -> Result<ImportedMediaFile, MediaStoreError> {
        let id = Ulid::new().to_string();
        let account_dir = self.root.join(safe_segment(account.as_str()));
        fs::create_dir_all(&account_dir)?;
        let extension = source
            .extension()
            .and_then(|extension| extension.to_str())
            .filter(|extension| {
                !extension.is_empty()
                    && extension
                        .chars()
                        .all(|character| character.is_ascii_alphanumeric())
            });
        let filename = match extension {
            Some(extension) => format!("{id}.{extension}"),
            None => id.clone(),
        };
        let destination = account_dir.join(filename);
        let temporary = account_dir.join(format!(".{id}.partial"));
        fs::copy(source, &temporary)?;
        File::open(&temporary)?.sync_all()?;
        let checksum = checksum(&temporary)?;
        let bytes = temporary.metadata()?.len();
        fs::rename(&temporary, &destination)?;

        let timestamp = now();
        let relative = destination
            .strip_prefix(&self.root)
            .expect("destination is beneath media root")
            .to_string_lossy()
            .into_owned();
        let record = MediaFileRecord {
            id: id.clone(),
            account_id: String::new(),
            path: relative,
            bytes,
            checksum,
            format,
            last_accessed_at: timestamp.clone(),
            pinned,
            status: MediaFileStatus::Ready,
            quarantined_at: None,
            revision: 1,
            updated_by: updated_by.into(),
            updated_at: timestamp,
        };
        if let Err(error) = self.store.put(schema::MEDIA_FILES, account, &id, &record) {
            let _ = fs::remove_file(&destination);
            return Err(error.into());
        }

        Ok(ImportedMediaFile {
            id,
            absolute_path: destination,
            bytes,
        })
    }

    /// Verify and return a file ready for serving. A mismatch quarantines it and returns
    /// `None`, so callers cannot accidentally serve bytes after detecting corruption.
    pub fn ready(
        &self,
        account: &AccountId,
        id: &str,
    ) -> Result<Option<ReadyMediaFile>, MediaStoreError> {
        let Some(mut record) =
            self.store
                .get::<MediaFileRecord>(schema::MEDIA_FILES, account, id)?
        else {
            return Ok(None);
        };
        if record.status != MediaFileStatus::Ready {
            return Ok(None);
        }
        let path = self.root.join(&record.path);
        let matches = path.is_file() && checksum(&path).is_ok_and(|value| value == record.checksum);
        if !matches {
            self.quarantine(account, &mut record)?;
            return Ok(None);
        }

        record.last_accessed_at = now();
        record.revision += 1;
        record.updated_by = "system".into();
        record.updated_at = now();
        self.store.put(schema::MEDIA_FILES, account, id, &record)?;

        Ok(Some(ReadyMediaFile {
            id: record.id,
            absolute_path: path,
            bytes: record.bytes,
            format: record.format,
        }))
    }

    pub fn touch(
        &self,
        account: &AccountId,
        id: &str,
        updated_by: &str,
    ) -> Result<bool, MediaStoreError> {
        let Some(mut record) =
            self.store
                .get::<MediaFileRecord>(schema::MEDIA_FILES, account, id)?
        else {
            return Ok(false);
        };
        record.last_accessed_at = now();
        record.revision += 1;
        record.updated_by = updated_by.into();
        record.updated_at = now();
        self.store.put(schema::MEDIA_FILES, account, id, &record)?;
        Ok(true)
    }

    pub fn status(
        &self,
        account: &AccountId,
        id: &str,
    ) -> Result<Option<MediaFileStatus>, MediaStoreError> {
        Ok(self
            .store
            .get::<MediaFileRecord>(schema::MEDIA_FILES, account, id)?
            .map(|record| record.status))
    }

    pub fn exists(&self, account: &AccountId, id: &str) -> Result<bool, MediaStoreError> {
        let Some(record) = self
            .store
            .get::<MediaFileRecord>(schema::MEDIA_FILES, account, id)?
        else {
            return Ok(false);
        };
        Ok(record.status == MediaFileStatus::Ready && self.root.join(record.path).is_file())
    }

    pub fn delete(&self, account: &AccountId, id: &str) -> Result<bool, MediaStoreError> {
        let Some(record) = self
            .store
            .get::<MediaFileRecord>(schema::MEDIA_FILES, account, id)?
        else {
            return Ok(false);
        };
        match fs::remove_file(self.root.join(record.path)) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
        self.store.delete(schema::MEDIA_FILES, account, id)?;
        Ok(true)
    }

    pub fn quarantine_path(&self, id: &str) -> PathBuf {
        self.root.join("quarantine").join(id)
    }

    pub fn evict(
        &self,
        account: &AccountId,
        budget: u64,
        retain: &BTreeSet<String>,
    ) -> Result<Eviction, MediaStoreError> {
        let records = self
            .store
            .list::<MediaFileRecord>(schema::MEDIA_FILES, account)?;
        let mut total: u64 = records
            .iter()
            .filter(|record| record.status == MediaFileStatus::Ready)
            .map(|record| record.bytes)
            .sum();
        let mut candidates: Vec<_> = records
            .into_iter()
            .filter(|record| {
                record.status == MediaFileStatus::Ready
                    && !record.pinned
                    && !retain.contains(&record.id)
            })
            .collect();
        candidates.sort_by(|left, right| {
            left.last_accessed_at
                .cmp(&right.last_accessed_at)
                .then_with(|| left.id.cmp(&right.id))
        });

        let mut removed = Vec::new();
        for record in candidates {
            if total <= budget {
                break;
            }
            match fs::remove_file(self.root.join(&record.path)) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(error.into()),
            }
            self.store
                .delete(schema::MEDIA_FILES, account, &record.id)?;
            total = total.saturating_sub(record.bytes);
            removed.push(record.id);
        }

        Ok(Eviction {
            removed_media_file_ids: removed,
            bytes_after: total,
        })
    }

    fn quarantine(
        &self,
        account: &AccountId,
        record: &mut MediaFileRecord,
    ) -> Result<(), MediaStoreError> {
        let source = self.root.join(&record.path);
        let destination = self.quarantine_path(&record.id);
        if source.is_file() {
            fs::rename(source, &destination)?;
        }
        let timestamp = now();
        record.path = destination
            .strip_prefix(&self.root)
            .expect("quarantine is beneath media root")
            .to_string_lossy()
            .into_owned();
        record.status = MediaFileStatus::Quarantined;
        record.quarantined_at = Some(timestamp.clone());
        record.revision += 1;
        record.updated_by = "system".into();
        record.updated_at = timestamp;
        self.store
            .put(schema::MEDIA_FILES, account, &record.id, record)?;
        Ok(())
    }
}

fn checksum(path: &Path) -> Result<String, std::io::Error> {
    let mut file = File::open(path)?;
    let mut hasher = blake3::Hasher::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hasher.finalize().to_hex().to_string())
}

fn safe_segment(value: &str) -> String {
    if !value.is_empty()
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        value.to_string()
    } else {
        blake3::hash(value.as_bytes()).to_hex().to_string()
    }
}

fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Nanos, true)
}
