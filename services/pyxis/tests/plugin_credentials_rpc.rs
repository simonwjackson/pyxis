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
async fn config_can_be_set_and_removed_without_ever_being_returned() {
    let dir = tempfile::tempdir().expect("temp dir");
    let app = router(AppState::open(Store::open(dir.path()).expect("store")).expect("state"));
    let claim = rpc(
        &app,
        json!({ "_tag": "auth.device.claim", "payload": { "name": "config" } }),
        None,
    )
    .await;
    let token = claim["outcome"]["value"]["bearerToken"]
        .as_str()
        .expect("token");

    let set = rpc(
        &app,
        json!({
            "_tag": "plugin.config.set",
            "payload": {
                "pluginId": "pandora",
                "config": { "username": "user@example.com", "password": "secret" }
            }
        }),
        Some(token),
    )
    .await;
    assert_eq!(set["outcome"]["status"], "succeeded");

    let source = std::fs::read_to_string(Store::path_for(dir.path())).expect("source");
    assert!(!source.contains("user@example.com"));
    assert!(!source.contains("secret"));

    let removed = rpc(
        &app,
        json!({
            "_tag": "plugin.config.remove",
            "payload": { "pluginId": "pandora" }
        }),
        Some(token),
    )
    .await;
    assert_eq!(removed["outcome"]["status"], "succeeded");
}
