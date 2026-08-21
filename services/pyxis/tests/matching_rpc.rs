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
async fn manual_split_overrides_subsequent_evaluation_through_public_rpc() {
    let dir = tempfile::tempdir().expect("temp dir");
    let app = router(AppState::open(Store::open(dir.path()).expect("store")).expect("state"));
    let claim = rpc(
        &app,
        json!({ "_tag": "auth.device.claim", "payload": { "name": "matcher" } }),
        None,
    )
    .await;
    let token = claim["outcome"]["value"]["bearerToken"]
        .as_str()
        .expect("token");
    let items = json!({
        "left": {
            "id": "track-a",
            "artist": "David Bowie",
            "title": "Heroes",
            "album": "Heroes",
            "durationMs": 372000,
            "year": 1977
        },
        "right": {
            "id": "candidate-b",
            "artist": "David Bowie",
            "title": "Heroes!",
            "album": "Heroes",
            "durationMs": 372001,
            "year": 1977
        }
    });

    let automatic = rpc(
        &app,
        json!({ "_tag": "matching.evaluate", "payload": items }),
        Some(token),
    )
    .await;
    assert_eq!(automatic["outcome"]["value"]["decision"], "autoMerge");

    let split = rpc(
        &app,
        json!({
            "_tag": "matching.override.set",
            "payload": {
                "leftId": "track-a",
                "rightId": "candidate-b",
                "decision": "split"
            }
        }),
        Some(token),
    )
    .await;
    assert_eq!(split["outcome"]["status"], "succeeded");

    let manual = rpc(
        &app,
        json!({ "_tag": "matching.evaluate", "payload": items }),
        Some(token),
    )
    .await;
    assert_eq!(manual["outcome"]["value"]["decision"], "manualSplit");
}
