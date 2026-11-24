//! Output sessions against renderer state that changed outside Pyxis: another app took
//! the speaker, someone turned the volume on the speaker, or rooms were regrouped.

use std::path::PathBuf;

use axum::body::{to_bytes, Body};
use axum::http::{header, Request, StatusCode};
use futures_util::{SinkExt, StreamExt};
use pyxis::api::{router, AppState};
use pyxis::db::store::{AccountId, Store};
use pyxis::library::{AlbumInput, Library, TrackInput};
use pyxis::media::LocalCandidateInput;
use pyxis::plugins::host::{HostPolicy, PluginCandidate, PluginHost};
use serde_json::{json, Value};
use tower::ServiceExt;

async fn rpc(app: &axum::Router, request: Value, bearer: &str) -> Value {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/rpc")
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-pyxis-contract", pyxis::rpc::contract::CONTRACT_ID)
                .header(header::AUTHORIZATION, format!("Bearer {bearer}"))
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

struct Harness {
    _dir: tempfile::TempDir,
    root: PathBuf,
    app: axum::Router,
    token: String,
}

impl Harness {
    async fn start(topology: Option<Value>) -> Self {
        let dir = tempfile::tempdir().expect("temp dir");
        let root = dir.path().to_path_buf();
        if let Some(topology) = topology {
            std::fs::write(root.join("topology.json"), topology.to_string()).expect("topology");
        }
        let candidate =
            PluginCandidate::new(PathBuf::from(env!("CARGO_BIN_EXE_pyxis-plugin-laboratory")))
                .with_env("PYXIS_LAB_ID", "sonos")
                .with_env("PYXIS_LAB_CAPABILITY", "output")
                .with_env("PYXIS_LAB_OUTPUT_STATE_FILE", root.join("output-state"))
                .with_env("PYXIS_LAB_OUTPUT_TOPOLOGY_FILE", root.join("topology.json"))
                .with_env(
                    "PYXIS_LAB_GROUP_RESULT_FILE",
                    root.join("group-result.json"),
                )
                .with_env("PYXIS_LAB_CALL_LOG", root.join("calls.log"));
        let host = PluginHost::start(vec![candidate], HostPolicy::default()).expect("host");
        let store = Store::open(&root).expect("store");
        Library::open(store.clone())
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
        let audio = root.join("track.mp3");
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
        let app = router(state);
        let claim = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/rpc")
                    .header(header::CONTENT_TYPE, "application/json")
                    .header("x-pyxis-contract", pyxis::rpc::contract::CONTRACT_ID)
                    .body(Body::from(
                        json!({ "_tag": "auth.device.claim", "payload": { "name": "console" } })
                            .to_string(),
                    ))
                    .expect("claim request"),
            )
            .await
            .expect("claim response");
        let claim: Value =
            serde_json::from_slice(&to_bytes(claim.into_body(), 1024 * 1024).await.unwrap())
                .unwrap();
        let token = claim["outcome"]["value"]["bearerToken"]
            .as_str()
            .expect("token")
            .to_string();
        Harness {
            _dir: dir,
            root,
            app,
            token,
        }
    }

    async fn call(&self, request: Value) -> Value {
        rpc(&self.app, request, &self.token).await
    }

    async fn second_account_token(&self) -> String {
        let created = self
            .call(json!({
                "_tag": "account.create",
                "payload": { "name": "second", "deviceName": "second console" }
            }))
            .await;
        created["outcome"]["value"]["bearerToken"]
            .as_str()
            .expect("second token")
            .to_string()
    }

    async fn output_session(&self, target_id: &str, bearer: &str) -> String {
        rpc(
            &self.app,
            json!({ "_tag": "output.targets.list", "payload": { "pluginId": "sonos" } }),
            bearer,
        )
        .await;
        let created = rpc(
            &self.app,
            json!({
                "_tag": "output.session.create",
                "payload": { "pluginId": "sonos", "targetId": target_id, "name": target_id }
            }),
            bearer,
        )
        .await;
        created["outcome"]["value"]["id"]
            .as_str()
            .unwrap_or_else(|| panic!("session for {target_id}: {created}"))
            .to_string()
    }

    async fn command(&self, session_id: &str, command: Value) -> Value {
        self.call(json!({
            "_tag": "session.command.send",
            "payload": { "sessionId": session_id, "command": command }
        }))
        .await
    }

    async fn session(&self, session_id: &str) -> Value {
        self.call(json!({ "_tag": "session.state.get", "payload": { "sessionId": session_id } }))
            .await["outcome"]["value"]
            .clone()
    }

    fn renderer(&self, state: Value) {
        std::fs::write(self.root.join("output-state"), state.to_string()).expect("renderer");
    }

    fn calls(&self, operation: &str) -> usize {
        std::fs::read_to_string(self.root.join("calls.log"))
            .unwrap_or_default()
            .lines()
            .filter(|line| line.starts_with(&format!("{operation}|")))
            .count()
    }
}

fn room(id: &str, coordinator: bool) -> Value {
    let octet = id.len() + 20;
    json!({
        "id": id,
        "name": id,
        "address": format!("192.168.1.{octet}"),
        "locationUrl": format!("http://192.168.1.{octet}:1400/xml/device_description.xml"),
        "coordinator": coordinator
    })
}

fn topology(groups: &[(&str, &[&str])]) -> Value {
    json!({
        "groups": groups.iter().map(|(coordinator, members)| json!({
            "id": format!("group-{coordinator}"),
            "coordinatorId": coordinator,
            "coordinatorName": coordinator,
            "rooms": members.iter().map(|id| room(id, id == coordinator)).collect::<Vec<_>>()
        })).collect::<Vec<_>>(),
        "refreshedAt": 1,
        "authoritative": true
    })
}

#[tokio::test]
async fn play_takes_over_a_foreign_stream_and_other_commands_still_refuse() {
    let harness = Harness::start(None).await;
    let session = harness.output_session("RINCON_TEST", &harness.token).await;
    let queued = harness
        .command(
            &session,
            json!({ "_tag": "queue.add", "payload": { "trackIds": ["track-1"] } }),
        )
        .await;
    assert_eq!(queued["outcome"]["status"], "dispatched", "{queued}");
    harness.renderer(json!({
        "state": "PLAYING",
        "positionMs": 30_000,
        "streamUrl": "x-sonos-spotify:spotify%3atrack%3aother"
    }));

    let refused = harness
        .command(
            &session,
            json!({ "_tag": "volume.set", "payload": { "volume": 20 } }),
        )
        .await;
    assert_eq!(refused["outcome"]["status"], "unavailable", "{refused}");
    assert_eq!(
        refused["outcome"]["value"]["code"],
        "output.rendererOwnershipLost"
    );
    assert_eq!(harness.calls("volume.set"), 0);

    let played = harness
        .command(&session, json!({ "_tag": "transport.play", "payload": {} }))
        .await;
    assert_eq!(played["outcome"]["status"], "dispatched", "{played}");
    assert_eq!(harness.calls("transport.play"), 1);
    let state = harness.session(&session).await;
    assert_eq!(state["transport"], "playing", "{state}");

    let paused = harness
        .command(
            &session,
            json!({ "_tag": "transport.pause", "payload": {} }),
        )
        .await;
    assert_eq!(paused["outcome"]["status"], "dispatched", "{paused}");
}

#[tokio::test]
async fn session_volume_follows_a_change_made_on_the_speaker() {
    let harness = Harness::start(None).await;
    let session = harness.output_session("RINCON_TEST", &harness.token).await;
    let set = harness
        .command(
            &session,
            json!({ "_tag": "volume.set", "payload": { "volume": 12 } }),
        )
        .await;
    assert_eq!(set["outcome"]["status"], "dispatched", "{set}");
    assert_eq!(harness.session(&session).await["volume"], 12);

    harness.renderer(json!({ "state": "STOPPED", "volume": 63 }));
    let state = harness.session(&session).await;
    assert_eq!(state["volume"], 63, "{state}");

    // A renderer that cannot report volume leaves the last known value alone.
    harness.renderer(json!({ "state": "STOPPED" }));
    assert_eq!(harness.session(&session).await["volume"], 63);
}

#[tokio::test]
async fn regrouping_refuses_only_when_a_session_target_would_move() {
    let grouped = topology(&[("KITCHEN", &["KIDS", "KITCHEN"]), ("LIVING", &["LIVING"])]);
    let harness = Harness::start(Some(grouped)).await;
    let kitchen = harness.output_session("KITCHEN", &harness.token).await;
    assert!(!kitchen.is_empty());

    let group_set = |coordinator: &str, members: &[&str]| {
        json!({
            "_tag": "output.group.set",
            "payload": { "pluginId": "sonos", "coordinatorId": coordinator, "memberIds": members }
        })
    };

    let converged = |groups: &[(&str, &[&str])]| {
        std::fs::write(
            harness.root.join("group-result.json"),
            topology(groups).to_string(),
        )
        .unwrap()
    };
    converged(&[
        ("KITCHEN", &["KITCHEN"]),
        ("KIDS", &["KIDS"]),
        ("LIVING", &["LIVING"]),
    ]);
    // Splitting Kids out of Kitchen's group leaves the Kitchen session on its coordinator.
    let split = harness.call(group_set("KIDS", &["KIDS"])).await;
    assert_eq!(split["outcome"]["status"], "ready", "{split}");

    // The room being split out may have its own session too: it becomes its own coordinator.
    std::fs::write(
        harness.root.join("topology.json"),
        topology(&[
            ("KIDS", &["KIDS"]),
            ("KITCHEN", &["KITCHEN"]),
            ("LIVING", &["LIVING"]),
        ])
        .to_string(),
    )
    .unwrap();
    let kids = harness.output_session("KIDS", &harness.token).await;
    assert!(!kids.is_empty());
    std::fs::write(
        harness.root.join("topology.json"),
        topology(&[("KITCHEN", &["KIDS", "KITCHEN"]), ("LIVING", &["LIVING"])]).to_string(),
    )
    .unwrap();
    let split_own = harness.call(group_set("KIDS", &["KIDS"])).await;
    assert_eq!(split_own["outcome"]["status"], "ready", "{split_own}");

    // Pulling Kitchen under Living Room would move the Kitchen session's renderer.
    for session in [&kids, &kitchen] {
        let (room, other) = if session == &kids {
            ("KIDS", "KITCHEN")
        } else {
            ("KITCHEN", "KIDS")
        };
        converged(&[("LIVING", &["LIVING", room]), (other, &[other])]);
        let moved = harness
            .call(group_set(
                "LIVING",
                &["LIVING", if session == &kids { "KIDS" } else { "KITCHEN" }],
            ))
            .await;
        assert_eq!(moved["outcome"]["status"], "ready", "{moved}");
        let released = harness.session(session).await;
        assert!(released.get("output").is_none());
        assert_eq!(released["reachable"], false);
    }

    // Another account still hears every room of its group, so even a split is refused.
    let second = harness.second_account_token().await;
    let living = harness.output_session("LIVING", &second).await;
    assert!(!living.is_empty());
    std::fs::write(
        harness.root.join("topology.json"),
        topology(&[("LIVING", &["KIDS", "LIVING"]), ("KITCHEN", &["KITCHEN"])]).to_string(),
    )
    .unwrap();
    let foreign_split = harness.call(group_set("KIDS", &["KIDS"])).await;
    assert_eq!(
        foreign_split["outcome"]["status"], "unavailable",
        "{foreign_split}"
    );
    assert_eq!(
        foreign_split["outcome"]["value"]["code"],
        "output.groupBusy"
    );
}

#[tokio::test]
async fn regroup_requires_authoritative_discovery_of_every_requested_room() {
    let complete = topology(&[("A", &["A"]), ("B", &["B"])]);
    let h = Harness::start(Some(complete.clone())).await;
    let session = h.output_session("A", &h.token).await;
    let other = h.second_account_token().await;
    std::fs::write(
        h.root.join("group-result.json"),
        topology(&[("B", &["A", "B"])]).to_string(),
    )
    .unwrap();
    let mut uncertain = complete;
    uncertain["authoritative"] = json!(false);
    for discovery in [topology(&[("B", &["B"])]), uncertain] {
        std::fs::write(h.root.join("topology.json"), discovery.to_string()).unwrap();
        for bearer in [&h.token, &other] {
            let result=rpc(&h.app,json!({"_tag":"output.group.set","payload":{"pluginId":"sonos","coordinatorId":"B","memberIds":["A","B"]}}),bearer).await;
            assert_eq!(h.calls("group.set"), 0, "{result}");
            assert_eq!(result["outcome"]["status"], "unavailable");
            assert_eq!(h.session(&session).await["output"]["targetId"], "A");
        }
    }
}

#[tokio::test]
async fn failed_regroup_keeps_playing_and_success_publishes_one_release() {
    let harness = Harness::start(Some(topology(&[("A", &["A"]), ("B", &["B"])]))).await;
    let session = harness.output_session("A", &harness.token).await;
    for command in [
        json!({"_tag":"queue.add","payload":{"trackIds":["track-1"]}}),
        json!({"_tag":"transport.play","payload":{}}),
    ] {
        assert_eq!(
            harness.command(&session, command).await["outcome"]["status"],
            "dispatched"
        );
    }
    let regroup = json!({"_tag":"output.group.set","payload":{"pluginId":"sonos","coordinatorId":"B","memberIds":["A","B"]}});
    let result_path = harness.root.join("group-result.json");
    let unchanged = harness.call(regroup.clone()).await;
    assert_eq!(
        unchanged["outcome"]["value"]["code"],
        "output.groupNotConverged"
    );
    std::fs::write(&result_path, "{}").unwrap();
    assert_eq!(
        harness.call(regroup.clone()).await["outcome"]["status"],
        "unavailable"
    );
    let before = harness.session(&session).await;
    assert_eq!(before["transport"], "playing");
    assert_eq!(before["output"]["targetId"], "A");
    std::fs::write(result_path, topology(&[("B", &["A", "B"])]).to_string()).unwrap();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let app = harness.app.clone();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let (mut socket, _) = tokio_tungstenite::connect_async(format!("ws://{addr}/realtime"))
        .await
        .unwrap();
    socket.send(tokio_tungstenite::tungstenite::Message::Text(json!({"_tag":"realtime.hello","payload":{"bearerToken":harness.token,"topics":["sessions"],"contractId":pyxis::rpc::contract::CONTRACT_ID}}).to_string())).await.unwrap();
    let frame = |msg: tokio_tungstenite::tungstenite::Message| {
        serde_json::from_str::<Value>(msg.to_text().unwrap()).unwrap()
    };
    assert_eq!(
        frame(socket.next().await.unwrap().unwrap())["_tag"],
        "realtime.welcome"
    );
    assert_eq!(harness.call(regroup).await["outcome"]["status"], "ready");
    let after = harness.session(&session).await;
    assert_eq!(after["transport"], "stopped");
    assert_eq!(after["revision"], before["revision"].as_u64().unwrap() + 1);
    assert_eq!(after["reachable"], false);
    assert!(after.get("output").is_none());
    harness
        .call(json!({"_tag":"session.create","payload":{"name":"barrier"}}))
        .await;
    for expected in [after["name"].as_str().unwrap(), "barrier"] {
        let msg = tokio::time::timeout(std::time::Duration::from_secs(5), socket.next())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert_eq!(frame(msg)["payload"]["state"]["payload"]["name"], expected);
    }
}
