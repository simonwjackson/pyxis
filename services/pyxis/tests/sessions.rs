use pyxis::accounts::{AuthContext, Principal};
use pyxis::db::store::{AccountId, Store};
use pyxis::library::{AlbumInput, Library, TrackInput};
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

    // Two tracks are queued, so the first one running out is not the end of anything. The
    // session moves to the second and keeps playing: silence belongs at the end of a record,
    // not between its tracks.
    let advanced = sessions
        .command(&host, &session.id, SessionCommand::Play)
        .and_then(|_| sessions.command(&host, &session.id, SessionCommand::TrackEnded))
        .expect("first track ended");
    assert_eq!(advanced.transport, Transport::Playing);
    assert_eq!(advanced.cursor, Some(1));
    assert_eq!(advanced.current_track_id(), Some("track-2"));
    assert_eq!(advanced.position_ms, 0);
    // The new track brings its own length; keeping the old one would draw a progress bar
    // against the wrong duration.
    assert_eq!(advanced.duration_ms, None);
    let persisted = sessions
        .get(&host, &session.id)
        .expect("get")
        .expect("session");
    assert_eq!(persisted.duration_ms, None);
    assert_eq!(persisted.updated_at, advanced.updated_at);

    // The last track running out is the end of the album, and the session stops rather than
    // wrapping around. The client reads this to offer carrying on instead of carrying on.
    let ended = sessions
        .command(&host, &session.id, SessionCommand::TrackEnded)
        .expect("last track ended");
    assert_eq!(ended.transport, Transport::Ended);
    assert_eq!(ended.cursor, Some(1));

    let stopped = sessions
        .command(&host, &session.id, SessionCommand::Stop)
        .expect("stop");
    assert_eq!(stopped.transport, Transport::Stopped);
    assert_eq!(stopped.position_ms, 0);
}

#[test]
fn replacing_an_album_starts_at_track_one_after_sync_and_reopen() {
    for with_receipts in [false, true] {
        let dir = tempfile::tempdir().expect("temp dir");
        let host = auth("account-a", "device-a");
        let store = Store::open(dir.path()).expect("store");
        let sessions = Sessions::open(store.clone());
        let session = sessions.create(&host, "Phone").expect("create");
        let commands = [
            SessionCommand::QueueAdd {
                track_ids: (1..=10).map(|index| format!("old-{index}")).collect(),
            },
            SessionCommand::CursorJump { index: 6 },
            SessionCommand::Play,
            SessionCommand::PositionReport {
                position_ms: 12_000,
                duration_ms: Some(240_000),
            },
            SessionCommand::QueueClear,
            SessionCommand::QueueAdd {
                track_ids: (1..=14).map(|index| format!("new-{index}")).collect(),
            },
            SessionCommand::Play,
        ];
        for (index, command) in commands.into_iter().enumerate() {
            let id = format!("command-{index}");
            let fingerprint = format!("{command:?}");
            let receipt = with_receipts.then_some((id.as_str(), fingerprint.as_str()));
            let applied = sessions
                .command_once(&host, &session.id, command.clone(), receipt)
                .expect("command");
            let persisted = sessions
                .get(&host, &session.id)
                .expect("get")
                .expect("session");
            assert_eq!(persisted, applied);
            if index == 4 {
                assert!(persisted.queue.is_empty());
                assert_eq!(persisted.cursor, None);
                assert_eq!(persisted.duration_ms, None);
            }
            if with_receipts {
                let replayed = sessions
                    .command_once(&host, &session.id, command, receipt)
                    .expect("replay");
                assert_eq!(replayed, applied);
            }
        }
        let played = sessions
            .get(&host, &session.id)
            .expect("get")
            .expect("session");
        assert_eq!(played.cursor, Some(0), "receipts: {with_receipts}");
        assert_eq!(played.current_track_id(), Some("new-1"));
        assert_eq!(played.position_ms, 0);
        assert_eq!(played.duration_ms, None);
        store.close().expect("close");
        let reopened = Sessions::open(Store::open(dir.path()).expect("reopen"));
        let persisted = reopened
            .get(&host, &session.id)
            .expect("get")
            .expect("session");
        assert_eq!(persisted.cursor, Some(0));
        assert_eq!(persisted.current_track_id(), Some("new-1"));
        assert_eq!(persisted.duration_ms, None);
    }
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
    assert_eq!(replay.updated_at, first.updated_at);
}

#[test]
fn handoff_durably_clears_source_fields_without_resetting_the_target_cursor() {
    let dir = tempfile::tempdir().expect("temp dir");
    let store = Store::open(dir.path()).expect("store");
    let sessions = Sessions::open(store.clone());
    let host = auth("account-a", "device-a");
    let target_host = auth("account-a", "device-b");
    sessions.attach_device("device-a");
    sessions.attach_device("device-b");
    let source = sessions.create(&host, "Source").expect("source");
    let target = sessions.create(&target_host, "Target").expect("target");
    sessions
        .command(
            &host,
            &source.id,
            SessionCommand::QueueAdd {
                track_ids: vec!["one".into(), "two".into(), "three".into()],
            },
        )
        .expect("queue");
    sessions
        .command(&host, &source.id, SessionCommand::CursorJump { index: 2 })
        .expect("jump");
    sessions
        .command(
            &host,
            &source.id,
            SessionCommand::PositionReport {
                position_ms: 12000,
                duration_ms: Some(240000),
            },
        )
        .expect("position");
    sessions
        .command(&host, &source.id, SessionCommand::Play)
        .expect("play");
    sessions
        .handoff(&host, &source.id, &target.id)
        .expect("handoff");
    store.close().expect("close");
    let reopened = Sessions::open(Store::open(dir.path()).expect("reopen"));
    let cleared = reopened
        .get(&host, &source.id)
        .expect("get source")
        .expect("source");
    assert!(cleared.queue.is_empty());
    assert_eq!(cleared.cursor, None);
    assert_eq!(cleared.duration_ms, None);
    let carried = reopened
        .get(&target_host, &target.id)
        .expect("get target")
        .expect("target");
    assert_eq!(carried.cursor, Some(2));
    assert_eq!(carried.current_track_id(), Some("three"));
    assert_eq!(carried.position_ms, 12000);
    assert_eq!(carried.duration_ms, Some(240000));
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
fn output_seek_receipt_fences_both_preparation_and_commit() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(dir.path()).unwrap();
    let actor = auth("account-a", "device-a");
    Library::open(store.clone())
        .add_album(
            &actor.account_id,
            AlbumInput {
                title: "Seek fixture".into(),
                artist: "Fixture artist".into(),
                year: None,
                artwork_url: None,
                source_reference: None,
                tracks: vec![TrackInput {
                    id: Some("track-1".into()),
                    title: "Track one".into(),
                    artist: "Fixture artist".into(),
                    duration_ms: Some(180_000),
                    track_number: Some(1),
                }],
            },
            "fixture",
        )
        .unwrap();
    let sessions = Sessions::open(store);
    let session = sessions
        .create_output(
            &actor,
            "Fixture output",
            OutputBinding {
                plugin_id: "renderer".into(),
                target_id: "room".into(),
            },
        )
        .unwrap();
    let queue = SessionCommand::QueueAdd {
        track_ids: vec!["track-1".into()],
    };
    sessions
        .prepare_output_command(&actor, &session.id, &queue, "queue", "queue-content")
        .unwrap();
    sessions
        .commit_output_command(
            &actor,
            &session.id,
            &queue,
            "queue",
            "queue-content",
            OutputConfirmation::default(),
        )
        .unwrap();
    let seek = SessionCommand::Seek {
        position_ms: 45_000,
    };
    for _ in 0..2 {
        let prepared = sessions
            .prepare_output_command(&actor, &session.id, &seek, "seek", "seek-content")
            .unwrap();
        let PreparedOutputCommand::Ready { current, next, .. } = prepared else {
            panic!("an unapplied seek remains retryable at its original revision")
        };
        assert_eq!(current.position_ms, 0);
        assert_eq!(next.position_ms, 45_000);
    }

    // A different accepted output command can advance the revision between preparation
    // and confirmation. The old confirmation must not overwrite the newer snapshot.
    sessions
        .prepare_output_command(&actor, &session.id, &queue, "append", "queue-content")
        .unwrap();
    let changed = sessions
        .commit_output_command(
            &actor,
            &session.id,
            &queue,
            "append",
            "queue-content",
            OutputConfirmation::default(),
        )
        .unwrap();
    let committed = sessions.commit_output_command(
        &actor,
        &session.id,
        &seek,
        "seek",
        "seek-content",
        OutputConfirmation {
            position_ms: Some(45_000),
            duration_ms: Some(180_000),
        },
    );
    assert!(matches!(
        committed,
        Err(SessionError::Machine(
            pyxis::sessions::machine::MachineError::StaleSeek
        ))
    ));
    let retried =
        sessions.prepare_output_command(&actor, &session.id, &seek, "seek", "seek-content");
    assert!(matches!(
        retried,
        Err(SessionError::Machine(
            pyxis::sessions::machine::MachineError::StaleSeek
        ))
    ));
    assert_eq!(sessions.get(&actor, &session.id).unwrap().unwrap(), changed);
}

#[test]
fn an_unfenced_pending_output_seek_cannot_acquire_a_new_revision() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(dir.path()).unwrap();
    let sessions = Sessions::open(store.clone());
    let actor = auth("account-a", "device-a");
    let session = sessions
        .create_output(
            &actor,
            "Fixture output",
            OutputBinding {
                plugin_id: "renderer".into(),
                target_id: "room".into(),
            },
        )
        .unwrap();
    let seek = SessionCommand::Seek { position_ms: 0 };
    // An interrupted receipt from the unfenced output path has no original revision.
    // Persist that current-v3 shape rather than silently assigning it today's revision.
    let id = format!("{}:unfenced", session.id);
    let receipt = serde_json::json!({
        "id": id,
        "sessionId": session.id,
        "commandId": "unfenced",
        "fingerprint": "seek-content",
        "applied": false,
        "revision": 1,
        "updatedBy": "device-a",
        "updatedAt": "2026-10-24T00:00:00Z",
    });
    store
        .put(
            pyxis::db::schema::SESSION_COMMAND_RECEIPTS,
            &actor.account_id,
            &id,
            &receipt,
        )
        .unwrap();
    let retried =
        sessions.prepare_output_command(&actor, &session.id, &seek, "unfenced", "seek-content");
    assert!(matches!(
        retried,
        Err(SessionError::Machine(
            pyxis::sessions::machine::MachineError::StaleSeek
        ))
    ));
    let committed = sessions.commit_output_command(
        &actor,
        &session.id,
        &seek,
        "unfenced",
        "seek-content",
        OutputConfirmation::default(),
    );
    assert!(matches!(
        committed,
        Err(SessionError::Machine(
            pyxis::sessions::machine::MachineError::StaleSeek
        ))
    ));
    assert_eq!(sessions.get(&actor, &session.id).unwrap().unwrap(), session);
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

#[test]
fn a_retried_unapplied_seek_keeps_its_original_reserved_revision() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(dir.path()).unwrap();
    let sessions = Sessions::open(store.clone());
    let host = auth("account-a", "device-a");
    let session = sessions.create(&host, "Desk").unwrap();
    let reserved = sessions
        .reserve_command(&host, &session.id, "old-seek", "seek-content")
        .unwrap();
    let changed = sessions
        .command(
            &host,
            &session.id,
            SessionCommand::QueueAdd {
                track_ids: vec!["new-track".into()],
            },
        )
        .unwrap();
    drop(sessions);
    drop(store);
    let sessions = Sessions::open(Store::open(dir.path()).unwrap());
    assert_eq!(
        sessions
            .reserve_command(&host, &session.id, "old-seek", "seek-content")
            .unwrap(),
        reserved
    );
    let refused = sessions.command_once(
        &host,
        &session.id,
        SessionCommand::Seek { position_ms: 0 },
        Some(("old-seek", "seek-content")),
    );
    assert!(matches!(
        refused,
        Err(SessionError::Machine(
            pyxis::sessions::machine::MachineError::StaleSeek
        ))
    ));
    assert_eq!(
        sessions.get(&host, &session.id).unwrap().unwrap().revision,
        changed.revision
    );
}
