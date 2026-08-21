use pyxis::accounts::{AuthContext, Principal};
use pyxis::db::store::{AccountId, Store};
use pyxis::sessions::{SessionCommand, SessionError, Sessions, Transport};

fn auth(account: &str, device: &str) -> AuthContext {
    AuthContext {
        account_id: AccountId::new(account),
        principal: Principal::Device { id: device.into() },
    }
}

#[test]
fn transport_transitions_are_explicit_and_preserve_one_host_owner() {
    let dir = tempfile::tempdir().expect("temp dir");
    let sessions = Sessions::open(Store::open(dir.path()).expect("store"));
    let host = auth("account-a", "device-a");
    let session = sessions.create(&host, "Desk").expect("create");

    let queued = sessions
        .command(
            &host,
            &session.id,
            SessionCommand::QueueAdd {
                track_ids: vec!["track-1".into(), "track-2".into()],
            },
        )
        .expect("queue");
    assert_eq!(queued.cursor, Some(0));
    assert_eq!(queued.current_track_id(), Some("track-1"));

    let playing = sessions
        .command(&host, &session.id, SessionCommand::Play)
        .expect("play");
    assert_eq!(playing.transport, Transport::Playing);

    let progressed = sessions
        .command(
            &host,
            &session.id,
            SessionCommand::PositionReport {
                position_ms: 12_000,
                duration_ms: Some(240_000),
            },
        )
        .expect("position");
    assert_eq!(progressed.position_ms, 12_000);
    assert_eq!(progressed.duration_ms, Some(240_000));

    let paused = sessions
        .command(&host, &session.id, SessionCommand::Pause)
        .expect("pause");
    assert_eq!(paused.transport, Transport::Paused);

    let ended = sessions
        .command(&host, &session.id, SessionCommand::Play)
        .and_then(|_| sessions.command(&host, &session.id, SessionCommand::TrackEnded))
        .expect("ended");
    assert_eq!(ended.transport, Transport::Ended);

    let stopped = sessions
        .command(&host, &session.id, SessionCommand::Stop)
        .expect("stop");
    assert_eq!(stopped.transport, Transport::Stopped);
    assert_eq!(stopped.position_ms, 0);
}

#[test]
fn queue_edits_persist_and_survive_a_store_reopen() {
    let dir = tempfile::tempdir().expect("temp dir");
    let host = auth("account-a", "device-a");
    let session_id = {
        let store = Store::open(dir.path()).expect("store");
        let sessions = Sessions::open(store.clone());
        let session = sessions.create(&host, "Phone").expect("create");
        sessions
            .command(
                &host,
                &session.id,
                SessionCommand::QueueAdd {
                    track_ids: vec!["a".into(), "b".into(), "c".into()],
                },
            )
            .expect("add");
        sessions
            .command(&host, &session.id, SessionCommand::QueueRemove { index: 1 })
            .expect("remove");
        sessions
            .command(&host, &session.id, SessionCommand::CursorJump { index: 1 })
            .expect("jump");
        store.close().expect("close");
        session.id
    };

    let reopened = Sessions::open(Store::open(dir.path()).expect("reopen"));
    let session = reopened
        .get(&host, &session_id)
        .expect("get")
        .expect("session");

    assert_eq!(session.queue, vec!["a", "c"]);
    assert_eq!(session.cursor, Some(1));
    assert_eq!(session.current_track_id(), Some("c"));
}

#[test]
fn a_non_host_position_report_is_rejected() {
    let dir = tempfile::tempdir().expect("temp dir");
    let sessions = Sessions::open(Store::open(dir.path()).expect("store"));
    let host = auth("account-a", "device-a");
    let other = auth("account-a", "device-b");
    let session = sessions.create(&host, "Desk").expect("create");

    let error = sessions
        .command(
            &other,
            &session.id,
            SessionCommand::PositionReport {
                position_ms: 500,
                duration_ms: None,
            },
        )
        .expect_err("non-host must fail");

    assert!(matches!(error, SessionError::NotHost));
}

#[test]
fn disconnect_marks_a_session_unreachable_without_destroying_it() {
    let dir = tempfile::tempdir().expect("temp dir");
    let store = Store::open(dir.path()).expect("store");
    let sessions = Sessions::open(store.clone());
    let host = auth("account-a", "device-a");
    let session = sessions.create(&host, "Desk").expect("create");
    assert!(session.reachable);

    sessions.mark_device_reachable("device-a", false);
    let disconnected = sessions
        .get(&host, &session.id)
        .expect("get")
        .expect("session");
    assert!(!disconnected.reachable);

    store.close().expect("close");
    drop(sessions);
    let reopened = Sessions::open(Store::open(dir.path()).expect("reopen"));
    let after_restart = reopened
        .get(&host, &session.id)
        .expect("get")
        .expect("session");
    assert!(!after_restart.reachable);
}

#[test]
fn sessions_persist_track_identity_never_a_stream_url() {
    let dir = tempfile::tempdir().expect("temp dir");
    let store = Store::open(dir.path()).expect("store");
    let sessions = Sessions::open(store.clone());
    let host = auth("account-a", "device-a");
    let session = sessions.create(&host, "Desk").expect("create");
    let session = sessions
        .command(
            &host,
            &session.id,
            SessionCommand::QueueAdd {
                track_ids: vec!["track-1".into()],
            },
        )
        .expect("queue");

    assert_eq!(session.stream_path(), Some("/stream/track-1".into()));
    store.close().expect("close");
    let source = std::fs::read_to_string(Store::path_for(dir.path())).expect("source file");
    assert!(!source.contains("http://"));
    assert!(!source.contains("https://"));
}
