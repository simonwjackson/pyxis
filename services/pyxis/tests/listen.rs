use pyxis::db::store::{AccountId, Store};
use pyxis::listen::{ListenError, ListenLog, TrackListenInput};

fn event(id: &str, album_id: &str, listened_at: &str) -> TrackListenInput {
    TrackListenInput {
        id: id.into(),
        track_id: format!("track-{album_id}"),
        album_id: Some(album_id.into()),
        device_id: "device-a".into(),
        source_plugin_id: Some("ytmusic".into()),
        listened_at: listened_at.into(),
        played_ms: Some(180_000),
        completed: true,
        context: "album".into(),
        context_id: Some(album_id.into()),
    }
}

#[test]
fn append_updates_history_and_replay_is_idempotent() {
    let dir = tempfile::tempdir().expect("temp dir");
    let log = ListenLog::open(Store::open(dir.path()).expect("store"));
    let account = AccountId::new("account-a");
    let batch = vec![
        event(
            "01M0K000000000000000000001",
            "album-a",
            "2026-08-20T10:00:00Z",
        ),
        event(
            "01M0K000000000000000000002",
            "album-a",
            "2026-08-20T11:00:00Z",
        ),
    ];

    let first = log
        .append_batch(&account, batch.clone(), "device-a")
        .expect("append");
    let replay = log
        .append_batch(&account, batch, "device-a")
        .expect("replay");

    assert_eq!(first.accepted, 2);
    assert_eq!(first.duplicates, 0);
    assert_eq!(replay.accepted, 0);
    assert_eq!(replay.duplicates, 2);
    assert_eq!(log.history(&account, 10).unwrap().len(), 2);
}

#[test]
fn reusing_an_event_id_for_different_content_is_rejected() {
    let dir = tempfile::tempdir().expect("temp dir");
    let log = ListenLog::open(Store::open(dir.path()).expect("store"));
    let account = AccountId::new("account-a");
    let first = event(
        "01M0K000000000000000000003",
        "album-a",
        "2026-08-20T10:00:00Z",
    );
    let mut conflicting = first.clone();
    conflicting.track_id = "different-track".into();
    log.append_batch(&account, vec![first], "device-a")
        .expect("first");

    let error = log
        .append_batch(&account, vec![conflicting], "device-a")
        .expect_err("conflict");

    assert!(matches!(error, ListenError::EventIdConflict(_)));
}

#[test]
fn history_sorts_out_of_order_appends_by_listen_time() {
    let dir = tempfile::tempdir().expect("temp dir");
    let log = ListenLog::open(Store::open(dir.path()).expect("store"));
    let account = AccountId::new("account-a");
    log.append_batch(
        &account,
        vec![
            event(
                "01M0K000000000000000000004",
                "album-a",
                "2026-08-20T12:00:00Z",
            ),
            event(
                "01M0K000000000000000000005",
                "album-a",
                "2026-08-20T10:00:00Z",
            ),
            event(
                "01M0K000000000000000000006",
                "album-a",
                "2026-08-20T11:00:00Z",
            ),
        ],
        "device-a",
    )
    .expect("append");

    let history = log.history(&account, 10).expect("history");

    assert_eq!(history[0].listened_at, "2026-08-20T12:00:00Z");
    assert_eq!(history[1].listened_at, "2026-08-20T11:00:00Z");
    assert_eq!(history[2].listened_at, "2026-08-20T10:00:00Z");
}

#[test]
fn history_orders_timezone_offsets_by_instant_not_text() {
    let dir = tempfile::tempdir().expect("temp dir");
    let log = ListenLog::open(Store::open(dir.path()).expect("store"));
    let account = AccountId::new("account-a");
    log.append_batch(
        &account,
        vec![
            event(
                "01M0K00000000000000000000G",
                "album-a",
                "2026-08-20T12:00:00+02:00",
            ),
            event(
                "01M0K00000000000000000000H",
                "album-a",
                "2026-08-20T10:30:00Z",
            ),
        ],
        "device-a",
    )
    .expect("append");

    let history = log.history(&account, 10).expect("history");

    assert_eq!(history[0].listened_at, "2026-08-20T10:30:00Z");
}

#[test]
fn history_cursor_cannot_address_another_accounts_event() {
    let dir = tempfile::tempdir().unwrap();
    let log = ListenLog::open(Store::open(dir.path()).unwrap());
    let id = "01M0K000000000000000000004";
    log.append_batch(
        &AccountId::new("a"),
        vec![event(id, "album", "2026-08-20T12:00:00Z")],
        "device",
    )
    .unwrap();
    assert!(matches!(
        log.history_page(&AccountId::new("b"), 1, None, None, Some(id), None),
        Err(ListenError::InvalidCursor)
    ));
}
