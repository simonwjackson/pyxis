use pyxis::db::{
    schema,
    store::{AccountId, Store},
};
use serde_json::{json, Value};

fn session() -> Value {
    json!({
        "name": "Phone", "hostDeviceId": "device-a", "transport": "playing",
        "queue": ["track-1", "track-2", "track-3"], "cursor": 2,
        "positionMs": 12000, "durationMs": 240000, "volume": 50,
        "revision": 1, "updatedBy": "device-a", "updatedAt": "2026-09-21T00:00:00Z"
    })
}

fn cleared() -> Value {
    let mut value = session();
    let fields = value.as_object_mut().expect("object");
    fields.remove("cursor");
    fields.remove("durationMs");
    fields.insert("queue".into(), json!([]));
    fields.insert("transport".into(), json!("stopped"));
    fields.insert("positionMs".into(), json!(0));
    fields.insert("revision".into(), json!(2));
    fields.insert("updatedAt".into(), json!("2026-09-22T00:00:00Z"));
    value
}

#[test]
fn omitted_session_fields_are_removed_and_timestamps_survive_reopen() {
    let dir = tempfile::tempdir().expect("temp dir");
    let store = Store::open(dir.path()).expect("store");
    let account = AccountId::new("account-a");
    store
        .put_session_snapshot(&account, "session-1", &session())
        .expect("initial");
    let initial = store
        .get::<Value>(schema::SESSIONS, &account, "session-1")
        .expect("read")
        .expect("row");
    assert_eq!(initial["updatedAt"], session()["updatedAt"]);
    store
        .put_session_snapshot(&account, "session-1", &cleared())
        .expect("clear");
    let row = store
        .get::<Value>(schema::SESSIONS, &account, "session-1")
        .expect("read")
        .expect("row");
    assert!(row.get("cursor").is_none());
    assert!(row.get("durationMs").is_none());
    assert_eq!(row["queue"], json!([]));
    assert_eq!(row["updatedAt"], cleared()["updatedAt"]);
    assert_eq!(row["id"], "session-1");
    assert_eq!(row["accountId"], "account-a");
    store.close().expect("close");
    let reopened = Store::open(dir.path()).expect("reopen");
    assert_eq!(
        reopened
            .get::<Value>(schema::SESSIONS, &account, "session-1")
            .expect("read"),
        Some(row)
    );
}

#[test]
fn an_invalid_replacement_restores_the_deleted_session() {
    let dir = tempfile::tempdir().expect("temp dir");
    let store = Store::open(dir.path()).expect("store");
    let account = AccountId::new("account-a");
    store
        .put_session_snapshot(&account, "session-1", &session())
        .expect("initial");
    let before = store
        .get::<Value>(schema::SESSIONS, &account, "session-1")
        .expect("read");
    let mut invalid = cleared();
    invalid["queue"] = json!("not an array");
    assert!(store
        .put_session_snapshot(&account, "session-1", &invalid)
        .is_err());
    assert_eq!(
        store
            .get::<Value>(schema::SESSIONS, &account, "session-1")
            .expect("read"),
        before
    );
    store.close().expect("close");
    let reopened = Store::open(dir.path()).expect("reopen");
    assert_eq!(
        reopened
            .get::<Value>(schema::SESSIONS, &account, "session-1")
            .expect("read"),
        before
    );
}

#[test]
fn a_later_batch_failure_rolls_back_the_session_and_its_receipt() {
    let dir = tempfile::tempdir().expect("temp dir");
    let store = Store::open(dir.path()).expect("store");
    let account = AccountId::new("account-a");
    store
        .put_session_snapshot(&account, "session-1", &session())
        .expect("initial");
    let before = store
        .get::<Value>(schema::SESSIONS, &account, "session-1")
        .expect("read");
    let receipt = json!({
        "sessionId": "session-1", "commandId": "command-1", "fingerprint": "queue.clear",
        "applied": true, "revision": 1, "updatedBy": "device-a", "updatedAt": "2026-09-22T00:00:00Z"
    });
    let writes = [
        Store::session_snapshot("session-1", &cleared()).expect("snapshot"),
        Store::write(schema::SESSION_COMMAND_RECEIPTS, "receipt-1", &receipt).expect("receipt"),
        Store::write(schema::SESSION_COMMAND_RECEIPTS, "invalid", &json!({})).expect("invalid"),
    ];
    assert!(store.put_mixed_batch(&account, &writes).is_err());
    assert_eq!(
        store
            .get::<Value>(schema::SESSIONS, &account, "session-1")
            .expect("read"),
        before
    );
    assert!(store
        .get::<Value>(schema::SESSION_COMMAND_RECEIPTS, &account, "receipt-1")
        .expect("receipt")
        .is_none());
    store.close().expect("close");
    let reopened = Store::open(dir.path()).expect("reopen");
    assert_eq!(
        reopened
            .get::<Value>(schema::SESSIONS, &account, "session-1")
            .expect("read"),
        before
    );
    assert!(reopened
        .get::<Value>(schema::SESSION_COMMAND_RECEIPTS, &account, "receipt-1")
        .expect("receipt")
        .is_none());
}

#[test]
fn a_scope_collision_preserves_the_owner_and_rolls_back_earlier_writes() {
    let dir = tempfile::tempdir().expect("temp dir");
    let store = Store::open(dir.path()).expect("store");
    let owner = AccountId::new("owner");
    let other = AccountId::new("other");
    store
        .put_session_snapshot(&owner, "session-1", &session())
        .expect("initial");
    let before = store
        .get::<Value>(schema::SESSIONS, &owner, "session-1")
        .expect("read");
    let writes = [
        Store::session_snapshot("new-session", &session()).expect("new"),
        Store::session_snapshot("session-1", &cleared()).expect("collision"),
    ];
    assert!(store.put_mixed_batch(&other, &writes).is_err());
    assert_eq!(
        store
            .get::<Value>(schema::SESSIONS, &owner, "session-1")
            .expect("read"),
        before
    );
    assert!(store
        .get::<Value>(schema::SESSIONS, &other, "new-session")
        .expect("new")
        .is_none());
    assert!(store
        .get::<Value>(schema::SESSIONS, &other, "session-1")
        .expect("collision")
        .is_none());
}
