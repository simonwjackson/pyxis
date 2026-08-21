use axum::body::{to_bytes, Body};
use axum::http::{Request, StatusCode};
use pyxis::api::{router, AppState};
use pyxis::db::store::Store;
use serde_json::{json, Value};
use tempfile::TempDir;
use tower::ServiceExt;

fn test_app() -> (TempDir, axum::Router) {
    let dir = tempfile::tempdir().expect("temp dir");
    let store = Store::open(dir.path()).expect("open store");
    let app = router(AppState::open(store).expect("open app state"));
    (dir, app)
}

async fn body_json(response: axum::response::Response) -> Value {
    let bytes = to_bytes(response.into_body(), 1024 * 1024)
        .await
        .expect("read body");
    serde_json::from_slice(&bytes).expect("JSON response")
}

fn rpc_request(body: Value, bearer: Option<&str>) -> Request<Body> {
    let mut request = Request::builder()
        .method("POST")
        .uri("/rpc")
        .header("content-type", "application/json");
    if let Some(bearer) = bearer {
        request = request.header("authorization", format!("Bearer {bearer}"));
    }
    request.body(Body::from(body.to_string())).expect("request")
}

async fn rpc(app: &axum::Router, body: Value, bearer: Option<&str>) -> Value {
    let response = app
        .clone()
        .oneshot(rpc_request(body, bearer))
        .await
        .expect("response");
    assert_eq!(response.status(), StatusCode::OK);
    body_json(response).await
}

async fn claim_device(app: &axum::Router, name: &str) -> Value {
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

fn bearer(grant: &Value) -> &str {
    grant["outcome"]["value"]["bearerToken"]
        .as_str()
        .expect("bearer token")
}

#[tokio::test]
async fn healthz_reports_that_the_process_can_serve_requests() {
    let (_dir, app) = test_app();

    let response = app
        .oneshot(
            Request::builder()
                .uri("/healthz")
                .body(Body::empty())
                .expect("request"),
        )
        .await
        .expect("response");

    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn fresh_boot_creates_default_and_claims_the_first_device_without_configuration() {
    let (_dir, app) = test_app();

    let status = rpc(
        &app,
        json!({ "_tag": "system.status.get", "payload": {} }),
        None,
    )
    .await;
    assert_eq!(status["outcome"]["value"]["accountCount"], 1);
    assert_eq!(status["outcome"]["value"]["pluginCount"], 0);

    let unauthenticated = rpc(&app, json!({ "_tag": "account.list", "payload": {} }), None).await;
    assert_eq!(unauthenticated["outcome"]["value"]["code"], "auth.required");

    let grant = claim_device(&app, "kitchen tablet").await;
    assert_eq!(grant["outcome"]["status"], "ready");
    assert_eq!(grant["outcome"]["value"]["account"]["id"], "default");
    assert_eq!(grant["outcome"]["value"]["account"]["name"], "default");
    assert_eq!(
        grant["outcome"]["value"]["device"]["name"],
        "kitchen tablet"
    );
    assert!(bearer(&grant).starts_with("pyx_dev_"));

    let accounts = rpc(
        &app,
        json!({ "_tag": "account.list", "payload": {} }),
        Some(bearer(&grant)),
    )
    .await;
    assert_eq!(accounts["outcome"]["status"], "ready");
    assert_eq!(accounts["outcome"]["value"].as_array().unwrap().len(), 1);
    assert_eq!(accounts["outcome"]["value"][0]["id"], "default");
}

#[tokio::test]
async fn a_second_account_disables_auto_adoption_but_pairing_still_works() {
    let (_dir, app) = test_app();
    let first = claim_device(&app, "phone").await;
    let default_token = bearer(&first).to_string();

    let created = rpc(
        &app,
        json!({
            "_tag": "account.create",
            "payload": { "name": "family", "deviceName": "phone" }
        }),
        Some(&default_token),
    )
    .await;
    assert_eq!(created["outcome"]["status"], "ready");
    assert_eq!(created["outcome"]["value"]["account"]["name"], "family");
    let family_token = bearer(&created).to_string();

    // The original grant remains valid after the second account appears.
    let original = rpc(
        &app,
        json!({ "_tag": "account.list", "payload": {} }),
        Some(&default_token),
    )
    .await;
    assert_eq!(original["outcome"]["value"][0]["id"], "default");

    let no_longer_automatic = claim_device(&app, "living room").await;
    assert_eq!(no_longer_automatic["outcome"]["status"], "pairingRequired");

    let pairing = rpc(
        &app,
        json!({ "_tag": "auth.pairing.create", "payload": {} }),
        Some(&family_token),
    )
    .await;
    let code = pairing["outcome"]["value"]["code"]
        .as_str()
        .expect("pairing code");

    let paired = rpc(
        &app,
        json!({
            "_tag": "auth.device.pair",
            "payload": { "name": "living room", "code": code }
        }),
        None,
    )
    .await;
    assert_eq!(paired["outcome"]["status"], "ready");
    assert_eq!(paired["outcome"]["value"]["account"]["name"], "family");
    assert!(bearer(&paired).starts_with("pyx_dev_"));
}

#[tokio::test]
async fn scoped_api_tokens_authenticate_and_revocation_takes_effect_immediately() {
    let (_dir, app) = test_app();
    let device = claim_device(&app, "automation host").await;
    let device_token = bearer(&device).to_string();

    let created = rpc(
        &app,
        json!({
            "_tag": "auth.token.create",
            "payload": { "name": "library reader", "scopes": ["account:read"] }
        }),
        Some(&device_token),
    )
    .await;
    assert_eq!(created["outcome"]["status"], "ready");
    let api_token = created["outcome"]["value"]["bearerToken"]
        .as_str()
        .expect("API token")
        .to_string();
    let token_id = created["outcome"]["value"]["token"]["id"]
        .as_str()
        .expect("token id")
        .to_string();
    assert!(api_token.starts_with("pyx_api_"));

    let readable = rpc(
        &app,
        json!({ "_tag": "account.list", "payload": {} }),
        Some(&api_token),
    )
    .await;
    assert_eq!(readable["outcome"]["status"], "ready");

    let denied = rpc(
        &app,
        json!({
            "_tag": "account.create",
            "payload": { "name": "forbidden", "deviceName": "automation" }
        }),
        Some(&api_token),
    )
    .await;
    assert_eq!(denied["outcome"]["value"]["code"], "auth.insufficientScope");

    let revoked = rpc(
        &app,
        json!({
            "_tag": "auth.token.revoke",
            "payload": { "tokenId": token_id }
        }),
        Some(&device_token),
    )
    .await;
    assert_eq!(
        revoked["outcome"]["status"], "succeeded",
        "unexpected revoke response: {revoked}"
    );

    let rejected = rpc(
        &app,
        json!({ "_tag": "account.list", "payload": {} }),
        Some(&api_token),
    )
    .await;
    assert_eq!(rejected["outcome"]["value"]["code"], "auth.invalidToken");
}

#[tokio::test]
async fn plugin_list_is_ready_and_empty_when_nothing_is_installed() {
    let (_dir, app) = test_app();
    let device = claim_device(&app, "plugin inspector").await;

    let plugins = rpc(
        &app,
        json!({ "_tag": "plugin.list", "payload": {} }),
        Some(bearer(&device)),
    )
    .await;

    assert_eq!(plugins["outcome"]["status"], "ready");
    assert_eq!(plugins["outcome"]["value"], json!([]));
}

#[tokio::test]
async fn unknown_operation_fails_closed_with_a_typed_protocol_error() {
    let (_dir, app) = test_app();

    let body = rpc(
        &app,
        json!({
            "_tag": "track.surprise.explode",
            "payload": {}
        }),
        None,
    )
    .await;

    assert_eq!(
        body,
        json!({
            "_tag": "rpc.failure",
            "outcome": {
                "status": "rejected",
                "value": {
                    "code": "request.unknownOperation",
                    "message": "unknown RPC operation 'track.surprise.explode'",
                    "retryable": false
                }
            }
        })
    );
}

#[tokio::test]
async fn malformed_json_is_a_typed_failure_not_a_panic_or_html_error() {
    let (_dir, app) = test_app();
    let request = Request::builder()
        .method("POST")
        .uri("/rpc")
        .header("content-type", "application/json")
        .body(Body::from("{this is not json"))
        .expect("request");

    let response = app.oneshot(request).await.expect("response");

    assert_eq!(response.status(), StatusCode::OK);
    let body = body_json(response).await;
    assert_eq!(body["_tag"], "rpc.failure");
    assert_eq!(body["outcome"]["status"], "rejected");
    assert_eq!(body["outcome"]["value"]["code"], "request.malformed");
    assert_eq!(body["outcome"]["value"]["retryable"], false);
}

#[tokio::test]
async fn a_known_operation_with_an_invalid_payload_is_rejected_explicitly() {
    let (_dir, app) = test_app();

    let body = rpc(
        &app,
        json!({
            "_tag": "system.status.get",
            "payload": { "surprise": true }
        }),
        None,
    )
    .await;

    assert_eq!(body["_tag"], "rpc.failure");
    assert_eq!(body["outcome"]["value"]["code"], "request.invalidPayload");
}
