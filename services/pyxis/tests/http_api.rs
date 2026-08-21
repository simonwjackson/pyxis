use axum::body::{to_bytes, Body};
use axum::http::{Request, StatusCode};
use pyxis::api::{router, AppState};
use pyxis::db::store::Store;
use pyxis::rpc::contract::RpcAccount;
use serde_json::{json, Value};
use tempfile::TempDir;
use tower::ServiceExt;

fn test_app() -> (TempDir, axum::Router) {
    let dir = tempfile::tempdir().expect("temp dir");
    let store = Store::open(dir.path()).expect("open store");
    let app = router(AppState::new(store));
    (dir, app)
}

async fn body_json(response: axum::response::Response) -> Value {
    let bytes = to_bytes(response.into_body(), 1024 * 1024)
        .await
        .expect("read body");
    serde_json::from_slice(&bytes).expect("JSON response")
}

fn rpc(body: Value) -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri("/rpc")
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .expect("request")
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
async fn system_status_is_well_formed_with_zero_plugins_and_zero_accounts() {
    let (_dir, app) = test_app();

    let response = app
        .oneshot(rpc(json!({
            "_tag": "system.status.get",
            "payload": {}
        })))
        .await
        .expect("response");

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        body_json(response).await,
        json!({
            "_tag": "system.status.get",
            "outcome": {
                "status": "ready",
                "value": {
                    "version": "2.0.0",
                    "contractId": "pyxis-rpc-v2",
                    "accountCount": 0,
                    "pluginCount": 0,
                    "capabilities": []
                }
            }
        })
    );
}

#[tokio::test]
async fn account_list_reads_the_real_store() {
    let dir = tempfile::tempdir().expect("temp dir");
    let store = Store::open(dir.path()).expect("open store");
    store
        .put_account(
            "account-1",
            &RpcAccount {
                id: "account-1".into(),
                name: "default".into(),
                is_default: true,
                created_at: "2026-08-21T00:00:00Z".into(),
            },
        )
        .expect("put account");
    let app = router(AppState::new(store));

    let response = app
        .oneshot(rpc(json!({
            "_tag": "account.list",
            "payload": {}
        })))
        .await
        .expect("response");

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        body_json(response).await["outcome"]["value"][0]["name"],
        "default"
    );
}

#[tokio::test]
async fn unknown_operation_fails_closed_with_a_typed_protocol_error() {
    let (_dir, app) = test_app();

    let response = app
        .oneshot(rpc(json!({
            "_tag": "track.surprise.explode",
            "payload": {}
        })))
        .await
        .expect("response");

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        body_json(response).await,
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

    let response = app
        .oneshot(rpc(json!({
            "_tag": "system.status.get",
            "payload": { "surprise": true }
        })))
        .await
        .expect("response");

    let body = body_json(response).await;
    assert_eq!(body["_tag"], "rpc.failure");
    assert_eq!(body["outcome"]["value"]["code"], "request.invalidPayload");
}
