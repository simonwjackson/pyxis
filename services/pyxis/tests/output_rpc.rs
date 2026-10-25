use std::path::PathBuf;

use axum::body::{to_bytes, Body};
use axum::http::{header, Request, StatusCode};
use pyxis::api::{router, AppState};
use pyxis::db::store::{AccountId, Store};
use pyxis::library::{AlbumInput, Library, TrackInput};
use pyxis::media::LocalCandidateInput;
use pyxis::plugins::host::{HostPolicy, PluginCandidate, PluginHost};
use serde_json::{json, Value};
use tower::ServiceExt;

async fn rpc(app: &axum::Router, request: Value, bearer: Option<&str>) -> Value {
    let mut builder = Request::builder()
        .method("POST")
        .uri("/rpc")
        .header(header::CONTENT_TYPE, "application/json")
        .header("x-pyxis-contract", pyxis::rpc::contract::CONTRACT_ID);
    if let Some(bearer) = bearer {
        builder = builder.header(header::AUTHORIZATION, format!("Bearer {bearer}"));
    }
    let response = app
        .clone()
        .oneshot(
            builder
                .body(Body::from(request.to_string()))
                .expect("request"),
        )
        .await
        .expect("response");
    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), 1024 * 1024)
        .await
        .expect("body");
    serde_json::from_slice(&body).expect("JSON")
}

#[tokio::test]
async fn sonos_target_hosts_a_core_session_and_applies_console_transport() {
    let dir = tempfile::tempdir().expect("temp dir");
    let call_log = dir.path().join("sonos-calls.log");
    let candidate =
        PluginCandidate::new(PathBuf::from(env!("CARGO_BIN_EXE_pyxis-plugin-laboratory")))
            .with_env("PYXIS_LAB_ID", "sonos")
            .with_env("PYXIS_LAB_CAPABILITY", "output")
            .with_env(
                "PYXIS_LAB_OUTPUT_STATE_FILE",
                dir.path().join("output-state"),
            )
            .with_env(
                "PYXIS_LAB_PLAY_POSITION_FILE",
                dir.path().join("play-position"),
            )
            .with_env("PYXIS_LAB_CALL_LOG", call_log.as_os_str())
            .with_env(
                "PYXIS_LAB_SEEK_BEHAVIOR_FILE",
                dir.path().join("seek-behavior"),
            );
    let host = PluginHost::start(vec![candidate], HostPolicy::default()).expect("host");
    let store = Store::open(dir.path()).expect("store");
    let library = Library::open(store.clone());
    library
        .add_album(
            &AccountId::new("default"),
            AlbumInput {
                title: "Heroes".into(),
                artist: "David Bowie".into(),
                year: Some(1977),
                artwork_url: None,
                source_reference: None,
                tracks: vec![TrackInput {
                    id: Some("track-1".into()),
                    title: "Heroes".into(),
                    artist: "David Bowie".into(),
                    duration_ms: Some(180_000),
                    track_number: Some(1),
                }],
            },
            "test",
        )
        .expect("album");
    let state = AppState::open_with_plugins_and_lan_base(
        store,
        host,
        Some("http://192.168.1.2:4488".into()),
    )
    .expect("state");
    let audio = dir.path().join("track.mp3");
    std::fs::write(&audio, b"sonos-audio").expect("audio");
    state
        .media
        .import_local_candidate(
            &AccountId::new("default"),
            "track-1",
            &audio,
            LocalCandidateInput::lossless("mp3", true),
            "test",
        )
        .expect("candidate");
    let lan = pyxis::api::stream_router(state.clone());
    let app = router(state);
    let claim = rpc(
        &app,
        json!({ "_tag": "auth.device.claim", "payload": { "name": "console" } }),
        None,
    )
    .await;
    let token = claim["outcome"]["value"]["bearerToken"]
        .as_str()
        .expect("token");

    let targets = rpc(
        &app,
        json!({ "_tag": "output.targets.list", "payload": { "pluginId": "sonos" } }),
        Some(token),
    )
    .await;
    assert_eq!(
        targets["outcome"]["value"]["groups"][0]["rooms"][0]["name"],
        "Test Room"
    );

    let grouped = rpc(
        &app,
        json!({
            "_tag": "output.group.set",
            "payload": {
                "pluginId": "sonos",
                "coordinatorId": "RINCON_TEST",
                "memberIds": ["RINCON_TEST"]
            }
        }),
        Some(token),
    )
    .await;
    assert_eq!(grouped["outcome"]["status"], "ready");

    let created = rpc(
        &app,
        json!({
            "_tag": "output.session.create",
            "payload": {
                "pluginId": "sonos",
                "targetId": "RINCON_TEST",
                "name": "Test Room"
            }
        }),
        Some(token),
    )
    .await;
    let session_id = created["outcome"]["value"]["id"]
        .as_str()
        .expect("session id");
    assert_eq!(created["outcome"]["value"]["reachable"], true);
    assert_eq!(created["outcome"]["value"]["output"]["pluginId"], "sonos");
    let second_account = rpc(
        &app,
        json!({
            "_tag": "account.create",
            "payload": { "name": "second", "deviceName": "second console" }
        }),
        Some(token),
    )
    .await;
    let second_token = second_account["outcome"]["value"]["bearerToken"]
        .as_str()
        .expect("second token");
    let collision = rpc(
        &app,
        json!({
            "_tag": "output.session.create",
            "payload": {
                "pluginId": "sonos",
                "targetId": "RINCON_TEST",
                "name": "Other Kitchen"
            }
        }),
        Some(second_token),
    )
    .await;
    assert_eq!(collision["outcome"]["status"], "unavailable");
    assert_eq!(collision["outcome"]["value"]["code"], "output.targetInUse");

    let device_session = rpc(
        &app,
        json!({ "_tag": "session.create", "payload": { "name": "Browser" } }),
        Some(token),
    )
    .await;
    let handoff = rpc(
        &app,
        json!({
            "_tag": "session.handoff",
            "payload": {
                "sessionId": device_session["outcome"]["value"]["id"],
                "targetSessionId": session_id
            }
        }),
        Some(token),
    )
    .await;
    assert_eq!(handoff["outcome"]["status"], "outputUnsupported");

    std::fs::write(&call_log, b"").expect("clear call log");
    let listed = rpc(
        &app,
        json!({ "_tag": "session.list", "payload": { "includeUnreachable": true } }),
        Some(token),
    )
    .await;
    assert_eq!(listed["outcome"]["status"], "ready");
    assert_eq!(listed["outcome"]["value"].as_array().unwrap().len(), 2);
    assert_eq!(
        std::fs::read_to_string(&call_log).expect("call log"),
        "",
        "session.list must not synchronously call an output plugin"
    );

    let queued = rpc(
        &app,
        json!({
            "_tag": "session.command.send",
            "payload": {
                "sessionId": session_id,
                "commandId": "QUEUE",
                "command": { "_tag": "queue.add", "payload": { "trackIds": ["track-1"] } }
            }
        }),
        Some(token),
    )
    .await;
    assert_eq!(queued["outcome"]["status"], "dispatched");

    let played = rpc(
        &app,
        json!({
            "_tag": "session.command.send",
            "payload": {
                "sessionId": session_id,
                "commandId": "PLAY",
                "command": { "_tag": "transport.play", "payload": {} }
            }
        }),
        Some(token),
    )
    .await;
    assert_eq!(played["outcome"]["status"], "dispatched");

    let paused = rpc(
        &app,
        json!({
            "_tag": "session.command.send",
            "payload": {
                "sessionId": session_id,
                "commandId": "PAUSE",
                "command": { "_tag": "transport.pause", "payload": {} }
            }
        }),
        Some(token),
    )
    .await;
    assert_eq!(paused["outcome"]["status"], "dispatched");
    let session = rpc(
        &app,
        json!({ "_tag": "session.state.get", "payload": { "sessionId": session_id } }),
        Some(token),
    )
    .await;
    assert_eq!(session["outcome"]["value"]["transport"], "paused");
    assert_eq!(session["outcome"]["value"]["positionMs"], 12_000);

    let seek = json!({"_tag":"session.command.send","payload":{"sessionId":session_id,"commandId":"SEEK","command":{"_tag":"transport.seek","payload":{"positionMs":45000}}}});
    let sought = rpc(&app, seek.clone(), Some(token)).await;
    assert_eq!(sought["outcome"]["status"], "dispatched", "{sought}");
    let confirmed = rpc(
        &app,
        json!({"_tag":"session.state.get","payload":{"sessionId":session_id}}),
        Some(token),
    )
    .await;
    assert_eq!(confirmed["outcome"]["value"]["positionMs"], 45000);
    let before_replay = std::fs::read_to_string(&call_log)
        .unwrap()
        .lines()
        .filter(|line| line.starts_with("transport.seek|"))
        .count();
    rpc(&app, seek, Some(token)).await;
    let after_replay = std::fs::read_to_string(&call_log)
        .unwrap()
        .lines()
        .filter(|line| line.starts_with("transport.seek|"))
        .count();
    assert_eq!(before_replay, after_replay);
    std::fs::write(dir.path().join("seek-behavior"), "ignored").unwrap();
    let ignored = rpc(&app, json!({"_tag":"session.command.send","payload":{"sessionId":session_id,"commandId":"IGNORED-SEEK","command":{"_tag":"transport.seek","payload":{"positionMs":90000}}}}), Some(token)).await;
    assert_eq!(ignored["outcome"]["status"], "unavailable");
    let unchanged = rpc(
        &app,
        json!({"_tag":"session.state.get","payload":{"sessionId":session_id}}),
        Some(token),
    )
    .await;
    assert_eq!(unchanged["outcome"]["value"]["positionMs"], 45000);
    std::fs::write(dir.path().join("seek-behavior"), "").unwrap();

    let resumed = rpc(
        &app,
        json!({
            "_tag": "session.command.send",
            "payload": {
                "sessionId": session_id,
                "commandId": "RESUME",
                "command": { "_tag": "transport.play", "payload": {} }
            }
        }),
        Some(token),
    )
    .await;
    assert_eq!(resumed["outcome"]["status"], "dispatched");
    let stopped = rpc(
        &app,
        json!({
            "_tag": "session.command.send",
            "payload": {
                "sessionId": session_id,
                "commandId": "STOP",
                "command": { "_tag": "transport.stop", "payload": {} }
            }
        }),
        Some(token),
    )
    .await;
    assert_eq!(stopped["outcome"]["status"], "dispatched");
    let stopped_state = rpc(
        &app,
        json!({ "_tag": "session.state.get", "payload": { "sessionId": session_id } }),
        Some(token),
    )
    .await;
    assert_eq!(stopped_state["outcome"]["value"]["transport"], "stopped");
    assert_eq!(stopped_state["outcome"]["value"]["positionMs"], 0);

    let calls = std::fs::read_to_string(&call_log).expect("call log");
    let play = calls
        .lines()
        .rfind(|line| line.starts_with("transport.play|"))
        .expect("play call");
    assert!(play.contains("http://192.168.1.2:4488/stream/track-1?outputToken="));
    assert!(play.contains("David Bowie"));
    assert!(play.contains("\"mimeType\":\"audio/mpeg\""));
    assert!(play.contains("\"positionMs\":45000"));
    let input: Value =
        serde_json::from_str(play.split_once('|').expect("logged input").1).expect("play JSON");
    let stream_url = reqwest::Url::parse(input["streamUrl"].as_str().expect("stream URL"))
        .expect("stream URL parse");
    let response = lan
        .clone()
        .oneshot(
            Request::builder()
                .uri(match stream_url.query() {
                    Some(query) => format!("{}?{query}", stream_url.path()),
                    None => stream_url.path().to_string(),
                })
                .body(Body::empty())
                .expect("stream request"),
        )
        .await
        .expect("stream response");
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        to_bytes(response.into_body(), 1024)
            .await
            .expect("stream body"),
        "sonos-audio"
    );
    let rpc_on_lan = lan
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/rpc")
                .body(Body::empty())
                .expect("LAN RPC request"),
        )
        .await
        .expect("LAN RPC response");
    assert_eq!(rpc_on_lan.status(), StatusCode::NOT_FOUND);

    // Core-hosted repeat and advancement use real plugin state/commands, never speakers.
    std::fs::write(dir.path().join("play-position"), "0").unwrap();
    for (mode, expected_cursor) in [("one", 0), ("all", 1), ("off", 1)] {
        if mode == "all" {
            let appended = rpc(&app, json!({"_tag":"session.command.send","payload":{"sessionId":session_id,"command":{"_tag":"queue.add","payload":{"trackIds":["track-1"]}}}}), Some(token)).await;
            assert_eq!(appended["outcome"]["status"], "dispatched");
        }
        let changed = rpc(&app, json!({"_tag":"session.command.send","payload":{"sessionId":session_id,"command":{"_tag":"repeat.set","payload":{"mode":mode}}}}), Some(token)).await;
        assert_eq!(changed["outcome"]["status"], "dispatched");
        if mode == "off" {
            rpc(&app, json!({"_tag":"session.command.send","payload":{"sessionId":session_id,"command":{"_tag":"cursor.jump","payload":{"index":1}}}}), Some(token)).await;
        }
        let played = rpc(&app, json!({"_tag":"session.command.send","payload":{"sessionId":session_id,"command":{"_tag":"transport.play","payload":{}}}}), Some(token)).await;
        assert_eq!(played["outcome"]["status"], "dispatched");
        std::fs::write(
            dir.path().join("output-state"),
            r#"{"state":"STOPPED","positionMs":180000}"#,
        )
        .unwrap();
        let ended = rpc(
            &app,
            json!({"_tag":"session.state.get","payload":{"sessionId":session_id}}),
            Some(token),
        )
        .await;
        assert_eq!(
            ended["outcome"]["value"]["transport"],
            if mode == "off" { "ended" } else { "playing" },
            "{ended}"
        );
        assert_eq!(ended["outcome"]["value"]["cursor"], expected_cursor);
        if mode != "off" {
            assert_eq!(ended["outcome"]["value"]["positionMs"], 0);
        }
        if mode == "all" {
            std::fs::write(
                dir.path().join("output-state"),
                r#"{"state":"STOPPED","positionMs":180000}"#,
            )
            .unwrap();
            let wrapped = rpc(
                &app,
                json!({"_tag":"session.state.get","payload":{"sessionId":session_id}}),
                Some(token),
            )
            .await;
            assert_eq!(wrapped["outcome"]["value"]["cursor"], 0);
        }
    }

    rpc(&app, json!({"_tag":"session.command.send","payload":{"sessionId":session_id,"command":{"_tag":"repeat.set","payload":{"mode":"one"}}}}), Some(token)).await;
    rpc(&app, json!({"_tag":"session.command.send","payload":{"sessionId":session_id,"command":{"_tag":"transport.play","payload":{}}}}), Some(token)).await;
    let before_refusal = rpc(
        &app,
        json!({"_tag":"session.state.get","payload":{"sessionId":session_id}}),
        Some(token),
    )
    .await;
    std::fs::write(dir.path().join("play-position"), "10000").unwrap();
    std::fs::write(
        dir.path().join("output-state"),
        r#"{"state":"STOPPED","positionMs":180000}"#,
    )
    .unwrap();
    let refused = rpc(
        &app,
        json!({"_tag":"session.state.get","payload":{"sessionId":session_id}}),
        Some(token),
    )
    .await;
    assert_eq!(
        refused["outcome"]["value"]["revision"],
        before_refusal["outcome"]["value"]["revision"]
    );
    assert_eq!(
        refused["outcome"]["value"]["cursor"],
        before_refusal["outcome"]["value"]["cursor"]
    );
    assert_eq!(refused["outcome"]["value"]["reachable"], false);

    drop(app);
    let restarted_candidate =
        PluginCandidate::new(PathBuf::from(env!("CARGO_BIN_EXE_pyxis-plugin-laboratory")))
            .with_env("PYXIS_LAB_ID", "sonos")
            .with_env("PYXIS_LAB_CAPABILITY", "output")
            .with_env(
                "PYXIS_LAB_OUTPUT_STATE_FILE",
                dir.path().join("output-state"),
            )
            .with_env(
                "PYXIS_LAB_PLAY_POSITION_FILE",
                dir.path().join("play-position"),
            )
            .with_env("PYXIS_LAB_CALL_LOG", call_log.as_os_str())
            .with_env(
                "PYXIS_LAB_SEEK_BEHAVIOR_FILE",
                dir.path().join("seek-behavior"),
            );
    let restarted_host = PluginHost::start(vec![restarted_candidate], HostPolicy::default())
        .expect("restarted host");
    let restarted = AppState::open_with_plugins_and_lan_base(
        Store::open(dir.path()).expect("reopened store"),
        restarted_host,
        Some("http://192.168.1.2:4488/".into()),
    )
    .expect("restarted state");
    let restarted_app = router(restarted);
    let restored_collision = rpc(
        &restarted_app,
        json!({
            "_tag": "output.session.create",
            "payload": {
                "pluginId": "sonos",
                "targetId": "RINCON_TEST",
                "name": "Restart collision"
            }
        }),
        Some(second_token),
    )
    .await;
    assert_eq!(restored_collision["outcome"]["status"], "unavailable");
    assert_eq!(
        restored_collision["outcome"]["value"]["code"],
        "output.targetInUse"
    );
}
