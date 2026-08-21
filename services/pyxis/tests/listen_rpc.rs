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

#[tokio::test]
async fn batch_append_replay_history_and_hot_are_public_contracts() {
    let dir = tempfile::tempdir().expect("temp dir");
    let app = router(AppState::open(Store::open(dir.path()).expect("store")).expect("state"));
    let claim = rpc(
        &app,
        json!({
            "_tag": "auth.device.claim",
            "payload": { "name": "listen test" }
        }),
        None,
    )
    .await;
    let token = claim["outcome"]["value"]["bearerToken"]
        .as_str()
        .expect("token");
    let device_id = claim["outcome"]["value"]["device"]["id"]
        .as_str()
        .expect("device id");
    let events = json!([
        {
            "id": "01M0K00000000000000000000C",
            "trackId": "track-1",
            "albumId": "album-1",
            "deviceId": device_id,
            "sourcePluginId": "ytmusic",
            "listenedAt": "2026-08-21T09:00:00Z",
            "playedMs": 180000,
            "completed": true,
            "context": "album",
            "contextId": "album-1"
        },
        {
            "id": "01M0K00000000000000000000D",
            "trackId": "track-1",
            "albumId": "album-1",
            "deviceId": device_id,
            "sourcePluginId": "ytmusic",
            "listenedAt": "2026-08-21T10:00:00Z",
            "playedMs": 180000,
            "completed": true,
            "context": "album",
            "contextId": "album-1"
        },
        {
            "id": "01M0K00000000000000000000E",
            "trackId": "track-1",
            "albumId": "album-1",
            "deviceId": device_id,
            "sourcePluginId": "ytmusic",
            "listenedAt": "2026-08-21T11:00:00Z",
            "playedMs": 180000,
            "completed": true,
            "context": "album",
            "contextId": "album-1"
        }
    ]);

    let first = rpc(
        &app,
        json!({
            "_tag": "listen.events.append",
            "payload": { "events": events }
        }),
        Some(token),
    )
    .await;
    let replay = rpc(
        &app,
        json!({
            "_tag": "listen.events.append",
            "payload": { "events": events }
        }),
        Some(token),
    )
    .await;
    assert_eq!(first["outcome"]["value"]["accepted"], 3);
    assert_eq!(replay["outcome"]["value"]["duplicates"], 3);

    let history = rpc(
        &app,
        json!({
            "_tag": "listen.history.list",
            "payload": { "limit": 10 }
        }),
        Some(token),
    )
    .await;
    assert_eq!(history["outcome"]["value"].as_array().unwrap().len(), 3);
    assert_eq!(
        history["outcome"]["value"][0]["listenedAt"],
        "2026-08-21T11:00:00Z"
    );

    let hot = rpc(
        &app,
        json!({
            "_tag": "library.hotAlbums.list",
            "payload": { "minRecentListens": 3, "windowDays": 30 }
        }),
        Some(token),
    )
    .await;
    assert_eq!(hot["outcome"]["status"], "ready");
    assert_eq!(hot["outcome"]["value"][0]["albumId"], "album-1");
    assert_eq!(hot["outcome"]["value"][0]["listenCount"], 3);
}

#[tokio::test]
async fn device_token_cannot_append_an_event_for_a_different_device() {
    let dir = tempfile::tempdir().expect("temp dir");
    let app = router(AppState::open(Store::open(dir.path()).expect("store")).expect("state"));
    let claim = rpc(
        &app,
        json!({
            "_tag": "auth.device.claim",
            "payload": { "name": "listen test" }
        }),
        None,
    )
    .await;
    let token = claim["outcome"]["value"]["bearerToken"]
        .as_str()
        .expect("token");

    let result = rpc(
        &app,
        json!({
            "_tag": "listen.events.append",
            "payload": {
                "events": [{
                    "id": "01M0K00000000000000000000F",
                    "trackId": "track-1",
                    "deviceId": "someone-else",
                    "listenedAt": "2026-08-21T11:00:00Z",
                    "completed": false,
                    "context": "queue"
                }]
            }
        }),
        Some(token),
    )
    .await;

    assert_eq!(result["outcome"]["status"], "invalid");
    assert_eq!(result["outcome"]["value"]["code"], "listen.deviceMismatch");
}
