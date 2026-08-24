use pyxis::accounts::{AuthContext, Principal};
use pyxis::db::store::{AccountId, Store};
use pyxis::sessions::{
    OutputBinding, OutputConfirmation, PreparedOutputCommand, SessionCommand, SessionError,
    Sessions, Transport,
};

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
fn reserved_command_ids_bind_content_and_apply_once() {
    let dir = tempfile::tempdir().expect("temp dir");
    let sessions = Sessions::open(Store::open(dir.path()).expect("store"));
    let host = auth("account-a", "device-a");
    let session = sessions.create(&host, "Desk").expect("create");

    sessions
        .reserve_command(&host, &session.id, &"é".repeat(100), "unicode")
        .expect("128-character limit counts characters, not UTF-8 bytes");
    assert!(matches!(
        sessions.reserve_command(&host, &session.id, &"x".repeat(129), "too-long"),
        Err(SessionError::InvalidCommandId)
    ));
    sessions
        .reserve_command(&host, &session.id, "01COMMAND", "queue-track-1")
        .expect("reserve");
    sessions
        .reserve_command(&host, &session.id, "01COMMAND", "queue-track-1")
        .expect("same reservation");
    assert!(matches!(
        sessions.reserve_command(&host, &session.id, "01COMMAND", "queue-track-2"),
        Err(SessionError::CommandIdConflict)
    ));

    let first = sessions
        .command_once(
            &host,
            &session.id,
            SessionCommand::QueueAdd {
                track_ids: vec!["track-1".into()],
            },
            Some(("01COMMAND", "queue-track-1")),
        )
        .expect("apply");
    let replay = sessions
        .command_once(
            &host,
            &session.id,
            SessionCommand::QueueAdd {
                track_ids: vec!["track-1".into()],
            },
            Some(("01COMMAND", "queue-track-1")),
        )
        .expect("replay");

    assert_eq!(first.queue, ["track-1"]);
    assert_eq!(replay.queue, ["track-1"]);
    assert_eq!(replay.revision, first.revision);
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
    let created = sessions.create(&host, "Desk").expect("create");
    assert!(
        !created.reachable,
        "a session is reachable only while its host holds a realtime socket"
    );

    sessions.attach_device("device-a");
    let connected = sessions
        .get(&host, &created.id)
        .expect("get")
        .expect("session");
    assert!(connected.reachable);

    sessions.detach_device("device-a");
    let disconnected = sessions
        .get(&host, &created.id)
        .expect("get")
        .expect("session");
    assert!(!disconnected.reachable);

    store.close().expect("close");
    drop(sessions);
    let reopened = Sessions::open(Store::open(dir.path()).expect("reopen"));
    let after_restart = reopened
        .get(&host, &created.id)
        .expect("get")
        .expect("session");
    assert!(!after_restart.reachable);
}

#[test]
fn output_sessions_prepare_effects_before_committing_state() {
    let dir = tempfile::tempdir().expect("temp dir");
    let sessions = Sessions::open(Store::open(dir.path()).expect("store"));
    let actor = auth("account-a", "device-a");
    let output = OutputBinding {
        plugin_id: "sonos".into(),
        target_id: "RINCON_KITCHEN".into(),
    };
    sessions.set_output_reachable(&actor.account_id, &output, true);
    let session = sessions
        .create_output(&actor, "Kitchen", output.clone())
        .expect("create output");
    assert_eq!(session.output, Some(output));
    assert!(session.reachable);

    let command = SessionCommand::QueueAdd {
        track_ids: vec!["track-1".into()],
    };
    let prepared = sessions
        .prepare_output_command(&actor, &session.id, &command, "COMMAND", "queue-one")
        .expect("prepare");
    let PreparedOutputCommand::Ready { current, next, .. } = prepared else {
        panic!("first command must need an effect")
    };
    assert!(current.queue.is_empty());
    assert_eq!(next.queue, ["track-1"]);
    assert!(sessions
        .get(&actor, &session.id)
        .expect("get")
        .expect("session")
        .queue
        .is_empty());

    let committed = sessions
        .commit_output_command(
            &actor,
            &session.id,
            &command,
            "COMMAND",
            "queue-one",
            OutputConfirmation::default(),
        )
        .expect("commit");
    assert_eq!(committed.queue, ["track-1"]);
    assert!(matches!(
        sessions
            .prepare_output_command(&actor, &session.id, &command, "COMMAND", "queue-one")
            .expect("replay"),
        PreparedOutputCommand::Applied(_)
    ));
}

#[test]
fn output_reachability_is_account_scoped() {
    let dir = tempfile::tempdir().expect("temp dir");
    let sessions = Sessions::open(Store::open(dir.path()).expect("store"));
    let first = auth("account-a", "device-a");
    let second = auth("account-b", "device-b");
    let output = OutputBinding {
        plugin_id: "sonos".into(),
        target_id: "RINCON_KITCHEN".into(),
    };
    let first_session = sessions
        .create_output(&first, "Kitchen", output.clone())
        .expect("first");
    let second_session = sessions
        .create_output(&second, "Kitchen", output.clone())
        .expect("second");
    sessions.set_output_reachable(&first.account_id, &output, true);

    assert!(
        sessions
            .get(&first, &first_session.id)
            .expect("first get")
            .expect("first session")
            .reachable
    );
    assert!(
        !sessions
            .get(&second, &second_session.id)
            .expect("second get")
            .expect("second session")
            .reachable
    );
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
