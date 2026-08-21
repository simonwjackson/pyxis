use chrono::{TimeZone, Utc};
use pyxis::db::schema;
use pyxis::db::store::{AccountId, Store};
use pyxis::listen::{HotConfig, ListenError, ListenLog, Projections, TrackListenInput};

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
fn hot_projection_respects_window_and_threshold_and_rebuilds_identically() {
    let dir = tempfile::tempdir().expect("temp dir");
    let store = Store::open(dir.path()).expect("store");
    let log = ListenLog::open(store.clone());
    let projections = Projections::open(store.clone());
    let account = AccountId::new("account-a");
    let now = Utc.with_ymd_and_hms(2026, 8, 21, 12, 0, 0).unwrap();
    log.append_batch(
        &account,
        vec![
            event("01M0K000000000000000000007", "hot", "2026-08-21T09:00:00Z"),
            event("01M0K000000000000000000008", "hot", "2026-08-21T10:00:00Z"),
            event("01M0K000000000000000000009", "hot", "2026-08-21T11:00:00Z"),
            event("01M0K00000000000000000000A", "warm", "2026-08-21T11:30:00Z"),
            event("01M0K00000000000000000000B", "old", "2026-07-01T11:30:00Z"),
        ],
        "device-a",
    )
    .expect("append");
    let config = HotConfig {
        min_recent_listens: 3,
        window_days: 30,
    };

    let first = projections
        .rebuild_hot(&account, config, now)
        .expect("first build");
    assert_eq!(first.len(), 1);
    assert_eq!(first[0].album_id, "hot");
    assert_eq!(first[0].listen_count, 3);

    let projection_rows: Vec<serde_json::Value> =
        store.list(schema::HOT_ALBUMS, &account).expect("rows");
    let deletions: Vec<_> = projection_rows
        .iter()
        .filter_map(|row| row["id"].as_str())
        .map(|id| (schema::HOT_ALBUMS.to_string(), id.to_string()))
        .collect();
    store
        .delete_batch(&account, &deletions)
        .expect("delete projection");

    let rebuilt = projections
        .rebuild_hot(&account, config, now)
        .expect("rebuild");
    assert_eq!(rebuilt, first);
}
