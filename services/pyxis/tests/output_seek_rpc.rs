//! Output seek receipts through authenticated RPC, durable storage and a real configured
//! plugin subprocess. No speaker or external source is used.

use std::path::{Path, PathBuf};

use axum::body::{to_bytes, Body};
use axum::http::{header, Request, StatusCode};
use pyxis::api::{router, AppState};
use pyxis::db::store::{AccountId, Store};
use pyxis::library::{AlbumInput, TrackInput};
use pyxis::media::LocalCandidateInput;
use pyxis::plugins::host::{HostPolicy, PluginCandidate, PluginHost};
use serde_json::{json, Value};
use tower::ServiceExt;

async fn rpc(app: &axum::Router, token: Option<&str>, operation: &str, payload: Value) -> Value {
    let mut request = Request::builder()
        .method("POST")
        .uri("/rpc")
        .header(header::CONTENT_TYPE, "application/json")
        .header("x-pyxis-contract", pyxis::rpc::contract::CONTRACT_ID);
    if let Some(token) = token {
        request = request.header(header::AUTHORIZATION, format!("Bearer {token}"));
    }
    let response = app
        .clone()
        .oneshot(
            request
                .body(Body::from(
                    json!({ "_tag": operation, "payload": payload }).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    serde_json::from_slice(&to_bytes(response.into_body(), 1024 * 1024).await.unwrap()).unwrap()
}

async fn send(
    app: &axum::Router,
    token: &str,
    session_id: &str,
    command_id: &str,
    command: Value,
) -> Value {
    rpc(
        app,
        Some(token),
        "session.command.send",
        json!({
            "sessionId": session_id, "commandId": command_id, "command": command,
        }),
    )
    .await
}

async fn snapshot(app: &axum::Router, token: &str, session_id: &str) -> Value {
    // Listing deliberately performs no renderer reconciliation, so it cannot change the
    // revision whose preservation these assertions measure.
    let result = rpc(
        app,
        Some(token),
        "session.list",
        json!({ "includeUnreachable": true }),
    )
    .await;
    assert_eq!(result["outcome"]["status"], "ready");
    result["outcome"]["value"]
        .as_array()
        .unwrap()
        .iter()
        .find(|session| session["id"] == session_id)
        .unwrap()
        .clone()
}

fn open_output_state(directory: &Path) -> AppState {
    let candidate =
        PluginCandidate::new(PathBuf::from(env!("CARGO_BIN_EXE_pyxis-plugin-laboratory")))
            .with_env("PYXIS_LAB_ID", "renderer")
            .with_env("PYXIS_LAB_CAPABILITY", "output")
            .with_env(
                "PYXIS_LAB_PLAY_POSITION_FILE",
                directory.join("play-position"),
            )
            .with_env("PYXIS_LAB_CALL_LOG", directory.join("output-calls"))
            .with_env(
                "PYXIS_LAB_SEEK_BEHAVIOR_FILE",
                directory.join("seek-behavior"),
            );
    let plugins = PluginHost::start(vec![candidate], HostPolicy::default()).unwrap();
    AppState::open_with_plugins_and_lan_base(
        Store::open(directory).unwrap(),
        plugins,
        Some("http://192.168.1.2:4488".into()),
    )
    .unwrap()
}

fn seed_tracks(state: &AppState, directory: &Path) {
    let account = AccountId::new("default");
    state
        .library
        .add_album(
            &account,
            AlbumInput {
                title: "Receipt fixture".into(),
                artist: "Fixture artist".into(),
                year: None,
                artwork_url: None,
                source_reference: None,
                tracks: vec![
                    TrackInput {
                        id: Some("track-a".into()),
                        title: "Track A".into(),
                        artist: "Fixture artist".into(),
                        duration_ms: Some(180_000),
                        track_number: Some(1),
                    },
                    TrackInput {
                        id: Some("track-b".into()),
                        title: "Track B".into(),
                        artist: "Fixture artist".into(),
                        duration_ms: Some(180_000),
                        track_number: Some(2),
                    },
                ],
            },
            "fixture",
        )
        .unwrap();
    for id in ["track-a", "track-b"] {
        let path = directory.join(format!("{id}.mp3"));
        std::fs::write(&path, id.as_bytes()).unwrap();
        state
            .media
            .import_local_candidate(
                &account,
                id,
                &path,
                LocalCandidateInput::lossless("mp3", true),
                "fixture",
            )
            .unwrap();
    }
}

fn output_calls(directory: &Path) -> Vec<(String, Value)> {
    std::fs::read_to_string(directory.join("output-calls"))
        .unwrap()
        .lines()
        .map(|line| {
            let (operation, payload) = line.split_once('|').unwrap();
            (operation.into(), serde_json::from_str(payload).unwrap())
        })
        .collect()
}

fn seek_count(directory: &Path) -> usize {
    output_calls(directory)
        .iter()
        .filter(|(operation, _)| operation == "transport.seek")
        .count()
}

async fn stale_output_seek_case(restart: bool) {
    let directory = tempfile::tempdir().unwrap();
    std::fs::write(directory.path().join("play-position"), "0").unwrap();
    let mut state = open_output_state(directory.path());
    seed_tracks(&state, directory.path());
    let mut app = router(state.clone());
    let claimed = rpc(
        &app,
        None,
        "auth.device.claim",
        json!({ "name": "output receipt fixture" }),
    )
    .await;
    let token = claimed["outcome"]["value"]["bearerToken"].as_str().unwrap();
    let created = rpc(
        &app,
        Some(token),
        "output.session.create",
        json!({
            "pluginId": "renderer", "targetId": "RINCON_TEST", "name": "Fixture output",
        }),
    )
    .await;
    assert_eq!(created["outcome"]["status"], "ready");
    let session_id = created["outcome"]["value"]["id"].as_str().unwrap();
    let queued = send(
        &app,
        token,
        session_id,
        "queue",
        json!({ "_tag": "queue.add", "payload": { "trackIds": ["track-a", "track-b"] } }),
    )
    .await;
    assert_eq!(queued["outcome"]["status"], "dispatched");
    let played = send(
        &app,
        token,
        session_id,
        "play-a",
        json!({ "_tag": "transport.play", "payload": {} }),
    )
    .await;
    assert_eq!(played["outcome"]["status"], "dispatched");
    let original = snapshot(&app, token, session_id).await;
    assert_eq!(original["currentTrackId"], "track-a");

    std::fs::write(directory.path().join("seek-behavior"), "ignored").unwrap();
    let seek = json!({ "_tag": "transport.seek", "payload": { "positionMs": 45_000 } });
    let failed = send(&app, token, session_id, "seek-s", seek.clone()).await;
    assert_eq!(failed["outcome"]["status"], "unavailable");
    assert_eq!(failed["outcome"]["value"]["code"], "output.invalidResponse");
    assert_eq!(
        seek_count(directory.path()),
        2,
        "failed seek and confirmed rollback must both reach the renderer"
    );
    assert_eq!(snapshot(&app, token, session_id).await, original);
    std::fs::write(directory.path().join("seek-behavior"), "").unwrap();

    let selected = send(
        &app,
        token,
        session_id,
        "select-b",
        json!({ "_tag": "cursor.jump", "payload": { "index": 1 } }),
    )
    .await;
    assert_eq!(selected["outcome"]["status"], "dispatched");
    let played = send(
        &app,
        token,
        session_id,
        "play-b",
        json!({ "_tag": "transport.play", "payload": {} }),
    )
    .await;
    assert_eq!(played["outcome"]["status"], "dispatched");
    if restart {
        drop(app);
        drop(state);
        state = open_output_state(directory.path());
        app = router(state.clone());
        // Re-establish the fixture renderer's loaded B stream. The previous plugin process
        // has ended, while the session and failed command receipt reopened from disk.
        let resumed = send(
            &app,
            token,
            session_id,
            "resume-b-after-restart",
            json!({ "_tag": "transport.play", "payload": {} }),
        )
        .await;
        assert_eq!(resumed["outcome"]["status"], "dispatched");
    }
    let before_retry = snapshot(&app, token, session_id).await;
    assert_eq!(before_retry["currentTrackId"], "track-b");
    assert_eq!(before_retry["positionMs"], 0);
    let calls = output_calls(directory.path());
    let loaded = calls
        .iter()
        .rev()
        .find(|(operation, _)| operation == "transport.play")
        .unwrap();
    assert_eq!(loaded.1["metadata"]["title"], "Track B");
    let before_seeks = seek_count(directory.path());
    let retried = send(&app, token, session_id, "seek-s", seek.clone()).await;
    assert_eq!(
        seek_count(directory.path()),
        before_seeks,
        "stale seek must not reach B; restart={restart}, response={retried}"
    );
    assert_eq!(retried["outcome"]["status"], "unavailable");
    assert_eq!(
        retried["outcome"]["value"]["code"],
        "session.invalidTransportCommand"
    );
    assert_eq!(retried["outcome"]["value"]["retryable"], false);
    assert_eq!(snapshot(&app, token, session_id).await, before_retry);

    let fresh = send(&app, token, session_id, "fresh-seek", seek.clone()).await;
    assert_eq!(fresh["outcome"]["status"], "dispatched", "{fresh}");
    assert_eq!(seek_count(directory.path()), before_seeks + 1);
    let sought = snapshot(&app, token, session_id).await;
    assert_eq!(sought["currentTrackId"], "track-b");
    assert_eq!(sought["positionMs"], 45_000);

    let selected = send(
        &app,
        token,
        session_id,
        "select-a",
        json!({ "_tag": "cursor.jump", "payload": { "index": 0 } }),
    )
    .await;
    assert_eq!(selected["outcome"]["status"], "dispatched");
    let played = send(
        &app,
        token,
        session_id,
        "play-a-again",
        json!({ "_tag": "transport.play", "payload": {} }),
    )
    .await;
    assert_eq!(played["outcome"]["status"], "dispatched");
    if restart {
        drop(app);
        drop(state);
        state = open_output_state(directory.path());
        app = router(state.clone());
        let resumed = send(
            &app,
            token,
            session_id,
            "resume-a-after-restart",
            json!({ "_tag": "transport.play", "payload": {} }),
        )
        .await;
        assert_eq!(resumed["outcome"]["status"], "dispatched");
    }
    let before_applied_replay = snapshot(&app, token, session_id).await;
    assert_eq!(before_applied_replay["currentTrackId"], "track-a");
    assert_eq!(before_applied_replay["positionMs"], 0);
    let before_seeks = seek_count(directory.path());
    let replay = send(&app, token, session_id, "fresh-seek", seek).await;
    assert_eq!(replay["outcome"]["status"], "dispatched");
    assert_eq!(
        seek_count(directory.path()),
        before_seeks,
        "an applied receipt must remain an effect-free replay after revision changes"
    );
    assert_eq!(
        snapshot(&app, token, session_id).await,
        before_applied_replay
    );
}

#[tokio::test]
async fn failed_output_seek_cannot_retarget_a_new_track() {
    stale_output_seek_case(false).await;
}

#[tokio::test]
async fn failed_output_seek_cannot_retarget_a_new_track_after_restart() {
    stale_output_seek_case(true).await;
}
