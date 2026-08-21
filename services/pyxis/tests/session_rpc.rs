use axum::body::{to_bytes, Body};
use axum::http::{header, Request, StatusCode};
use pyxis::api::{router, AppState};
use pyxis::db::store::Store;
use serde_json::{json, Value};
use tower::ServiceExt;

async fn rpc(app: &axum::Router, request: Value, bearer: Option<&str>) -> Value {
    let mut builder = Request::builder()
        .method("POST")
        .uri("/rpc")
        .header(header::CONTENT_TYPE, "application/json");
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

async fn claim(app: &axum::Router, name: &str) -> Value {
    rpc(
        app,
        json!({
            "_tag": "auth.device.claim",
            "payload": { "name": name }
        }),
        None,
    )
    .await
}

fn token(grant: &Value) -> &str {
    grant["outcome"]["value"]["bearerToken"]
        .as_str()
        .expect("token")
}

#[tokio::test]
async fn host_device_creates_queues_and_drives_its_session_through_one_command_union() {
    let dir = tempfile::tempdir().expect("temp dir");
    let state = AppState::open(Store::open(dir.path()).expect("store")).expect("state");
    let app = router(state);
    let host = claim(&app, "desk").await;

    let created = rpc(
        &app,
        json!({
            "_tag": "session.create",
            "payload": { "name": "Desk" }
        }),
        Some(token(&host)),
    )
    .await;
    let session_id = created["outcome"]["value"]["id"]
        .as_str()
        .expect("session id");

    let queued = rpc(
        &app,
        json!({
            "_tag": "session.command.run",
            "payload": {
                "sessionId": session_id,
                "command": {
                    "_tag": "queue.add",
                    "payload": { "trackIds": ["track-1", "track-2"] }
                }
            }
        }),
        Some(token(&host)),
    )
    .await;
    assert_eq!(queued["outcome"]["status"], "applied");
    assert_eq!(queued["outcome"]["value"]["currentTrackId"], "track-1");

    let playing = rpc(
        &app,
        json!({
            "_tag": "session.command.run",
            "payload": {
                "sessionId": session_id,
                "command": { "_tag": "transport.play", "payload": {} }
            }
        }),
        Some(token(&host)),
    )
    .await;
    assert_eq!(playing["outcome"]["value"]["transport"], "playing");

    let state = rpc(
        &app,
        json!({
            "_tag": "session.state.get",
            "payload": { "sessionId": session_id }
        }),
        Some(token(&host)),
    )
    .await;
    assert_eq!(
        state["outcome"]["value"]["queue"],
        json!(["track-1", "track-2"])
    );
    assert_eq!(state["outcome"]["value"]["streamPath"], "/stream/track-1");
}

#[tokio::test]
async fn another_device_can_read_but_cannot_report_host_transport_state() {
    let dir = tempfile::tempdir().expect("temp dir");
    let state = AppState::open(Store::open(dir.path()).expect("store")).expect("state");
    let app = router(state);
    let host = claim(&app, "desk").await;
    let other = claim(&app, "phone").await;
    let created = rpc(
        &app,
        json!({ "_tag": "session.create", "payload": { "name": "Desk" } }),
        Some(token(&host)),
    )
    .await;
    let session_id = created["outcome"]["value"]["id"]
        .as_str()
        .expect("session id");

    let listed = rpc(
        &app,
        json!({ "_tag": "session.list", "payload": {} }),
        Some(token(&other)),
    )
    .await;
    assert_eq!(listed["outcome"]["value"].as_array().unwrap().len(), 1);

    let rejected = rpc(
        &app,
        json!({
            "_tag": "session.command.run",
            "payload": {
                "sessionId": session_id,
                "command": {
                    "_tag": "position.report",
                    "payload": { "positionMs": 1000 }
                }
            }
        }),
        Some(token(&other)),
    )
    .await;
    assert_eq!(rejected["outcome"]["status"], "notHost");
}
