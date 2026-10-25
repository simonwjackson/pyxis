//! Browser access from another origin: CORS on `/rpc` and `/stream/:trackId`, and the
//! `Origin` check on the `/realtime` upgrade.

use std::net::SocketAddr;
use std::time::Duration;

use axum::body::{to_bytes, Body};
use axum::http::{header, HeaderMap, Method, Request, StatusCode};
use axum::Router;
use futures_util::{SinkExt, StreamExt};
use pyxis::api::{router, AppState};
use pyxis::db::store::{AccountId, Store};
use pyxis::media::{Fidelity, LocalCandidateInput};
use pyxis::origins::AllowedOrigins;
use serde_json::{json, Value};
use tempfile::TempDir;
use tokio::net::TcpListener;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::{Error as SocketError, Message};
use tower::ServiceExt;

const VELA: &str = "https://vela.example";
const AUDIO: &[u8] = b"0123456789-audio-bytes";

/// Origins a browser could plausibly send that must not be mistaken for the allowed one.
const LOOKALIKES: [&str; 5] = [
    "http://vela.example",
    "https://vela.example:8443",
    "https://vela.example.evil.test",
    "https://evilvela.example",
    "null",
];

fn state(directory: &TempDir, origins: &str) -> AppState {
    let store = Store::open(directory.path()).expect("open store");
    AppState::open(store)
        .expect("open app state")
        .with_allowed_origins(origins.parse::<AllowedOrigins>().expect("origins"))
}

fn app(origins: &str) -> (TempDir, Router) {
    let directory = tempfile::tempdir().expect("temp dir");
    let app = router(state(&directory, origins));
    (directory, app)
}

async fn send(app: &Router, request: Request<Body>) -> axum::response::Response {
    app.clone().oneshot(request).await.expect("response")
}

async fn json_body(response: axum::response::Response) -> Value {
    let bytes = to_bytes(response.into_body(), 1024 * 1024)
        .await
        .expect("body");
    serde_json::from_slice(&bytes).expect("JSON body")
}

fn preflight(path: &str, origin: &str, method: &str, headers: &str) -> Request<Body> {
    Request::builder()
        .method(Method::OPTIONS)
        .uri(path)
        .header(header::ORIGIN, origin)
        .header(header::ACCESS_CONTROL_REQUEST_METHOD, method)
        .header(header::ACCESS_CONTROL_REQUEST_HEADERS, headers)
        .body(Body::empty())
        .expect("preflight")
}

fn rpc(body: Value, origin: Option<&str>, bearer: Option<&str>) -> Request<Body> {
    let mut request = Request::builder()
        .method(Method::POST)
        .uri("/rpc")
        .header(header::CONTENT_TYPE, "application/json")
        .header("x-pyxis-contract", pyxis::rpc::contract::CONTRACT_ID);
    if let Some(origin) = origin {
        request = request.header(header::ORIGIN, origin);
    }
    if let Some(bearer) = bearer {
        request = request.header(header::AUTHORIZATION, format!("Bearer {bearer}"));
    }
    request.body(Body::from(body.to_string())).expect("rpc")
}

fn claim(origin: Option<&str>) -> Request<Body> {
    rpc(
        json!({ "_tag": "auth.device.claim", "payload": { "name": "vela" } }),
        origin,
        None,
    )
}

async fn bearer(app: &Router) -> String {
    json_body(send(app, claim(None)).await).await["outcome"]["value"]["bearerToken"]
        .as_str()
        .expect("bearer token")
        .to_string()
}

fn varies_by_origin(headers: &HeaderMap) -> bool {
    headers
        .get_all(header::VARY)
        .iter()
        .any(|value| value.to_str().is_ok_and(|value| value.contains("origin")))
}

fn has_cors_headers(headers: &HeaderMap) -> bool {
    headers
        .keys()
        .any(|name| name.as_str().starts_with("access-control-"))
}

fn listed(headers: &HeaderMap, name: header::HeaderName) -> Vec<String> {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .split(',')
        .map(|entry| entry.trim().to_ascii_lowercase())
        .collect()
}

#[tokio::test]
async fn an_allowed_origin_passes_rpc_preflight() {
    let (_directory, app) = app(VELA);

    let response = send(
        &app,
        preflight(
            "/rpc",
            VELA,
            "POST",
            "authorization, content-type, x-pyxis-contract",
        ),
    )
    .await;

    assert_eq!(response.status(), StatusCode::NO_CONTENT);
    let headers = response.headers();
    assert_eq!(headers[header::ACCESS_CONTROL_ALLOW_ORIGIN], VELA);
    assert!(varies_by_origin(headers));
    assert_eq!(
        listed(headers, header::ACCESS_CONTROL_ALLOW_METHODS),
        ["post"]
    );
    let allowed = listed(headers, header::ACCESS_CONTROL_ALLOW_HEADERS);
    for name in ["authorization", "content-type", "range", "x-pyxis-contract"] {
        assert!(allowed.iter().any(|entry| entry == name), "{name}");
    }
    assert!(headers.contains_key(header::ACCESS_CONTROL_MAX_AGE));
    // Bearer headers, not cookies, so credentialed CORS is never offered.
    assert!(!headers.contains_key(header::ACCESS_CONTROL_ALLOW_CREDENTIALS));
}

#[tokio::test]
async fn an_allowed_origin_can_claim_and_call_authenticated_rpc() {
    let (_directory, app) = app(VELA);

    let claimed = send(&app, claim(Some(VELA))).await;
    assert_eq!(claimed.status(), StatusCode::OK);
    assert_eq!(claimed.headers()[header::ACCESS_CONTROL_ALLOW_ORIGIN], VELA);
    assert!(varies_by_origin(claimed.headers()));
    assert!(!claimed
        .headers()
        .contains_key(header::ACCESS_CONTROL_ALLOW_CREDENTIALS));
    let grant = json_body(claimed).await;
    let token = grant["outcome"]["value"]["bearerToken"]
        .as_str()
        .expect("bearer token");

    let accounts = send(
        &app,
        rpc(
            json!({ "_tag": "account.list", "payload": {} }),
            Some(VELA),
            Some(token),
        ),
    )
    .await;
    assert_eq!(
        accounts.headers()[header::ACCESS_CONTROL_ALLOW_ORIGIN],
        VELA
    );
    assert_eq!(json_body(accounts).await["outcome"]["status"], "ready");
}

#[tokio::test]
async fn unknown_and_lookalike_origins_get_no_cors_grant() {
    let (_directory, app) = app(VELA);

    for origin in LOOKALIKES.into_iter().chain(["https://elsewhere.test"]) {
        let refused = send(
            &app,
            preflight("/rpc", origin, "POST", "authorization, content-type"),
        )
        .await;
        // Not answered as a preflight: the route's ordinary 405 for OPTIONS stands.
        assert_eq!(refused.status(), StatusCode::METHOD_NOT_ALLOWED, "{origin}");
        assert!(!refused
            .headers()
            .contains_key(header::ACCESS_CONTROL_ALLOW_ORIGIN));
        assert!(!refused
            .headers()
            .contains_key(header::ACCESS_CONTROL_ALLOW_HEADERS));

        let actual = send(&app, claim(Some(origin))).await;
        assert!(
            !actual
                .headers()
                .contains_key(header::ACCESS_CONTROL_ALLOW_ORIGIN),
            "{origin}"
        );
        assert!(varies_by_origin(actual.headers()), "{origin}");
    }
}

#[tokio::test]
async fn an_empty_allowlist_leaves_responses_unchanged() {
    let (_directory, app) = app("");

    let refused = send(&app, preflight("/rpc", VELA, "POST", "content-type")).await;
    assert_eq!(refused.status(), StatusCode::METHOD_NOT_ALLOWED);
    assert!(!has_cors_headers(refused.headers()));

    let actual = send(&app, claim(Some(VELA))).await;
    assert_eq!(actual.status(), StatusCode::OK);
    assert!(!has_cors_headers(actual.headers()));
    assert!(!actual.headers().contains_key(header::VARY));
}

fn app_with_local_track(origins: &str) -> (TempDir, Router) {
    let directory = tempfile::tempdir().expect("temp dir");
    let state = state(&directory, origins);
    let source = directory.path().join("local.webm");
    std::fs::write(&source, AUDIO).expect("local source");
    state
        .media
        .import_local_candidate(
            &AccountId::new("default"),
            "track-1",
            &source,
            LocalCandidateInput {
                format: Some("webm/opus".into()),
                fidelity: Fidelity {
                    lossless: false,
                    bitrate_kbps: Some(128),
                    sample_rate_hz: Some(48_000),
                },
                pinned: false,
            },
            "test",
        )
        .expect("local candidate");
    (directory, router(state))
}

fn stream(origin: &str, token: Option<&str>, range: &str) -> Request<Body> {
    let mut request = Request::builder()
        .uri("/stream/track-1")
        .header(header::ORIGIN, origin)
        .header(header::RANGE, range);
    if let Some(token) = token {
        request = request.header(header::AUTHORIZATION, format!("Bearer {token}"));
    }
    request.body(Body::empty()).expect("stream request")
}

#[tokio::test]
async fn an_allowed_origin_passes_stream_preflight() {
    let (_directory, app) = app_with_local_track(VELA);

    let response = send(
        &app,
        preflight("/stream/track-1", VELA, "GET", "authorization, range"),
    )
    .await;

    assert_eq!(response.status(), StatusCode::NO_CONTENT);
    assert_eq!(
        response.headers()[header::ACCESS_CONTROL_ALLOW_ORIGIN],
        VELA
    );
    assert_eq!(
        listed(response.headers(), header::ACCESS_CONTROL_ALLOW_METHODS),
        ["get", "head"]
    );
}

#[tokio::test]
async fn a_cross_origin_range_request_is_still_206_with_readable_range_headers() {
    let (_directory, app) = app_with_local_track(VELA);
    let token = bearer(&app).await;

    let response = send(&app, stream(VELA, Some(&token), "bytes=2-5")).await;

    assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
    let headers = response.headers();
    assert_eq!(headers[header::CONTENT_RANGE], "bytes 2-5/22");
    assert_eq!(headers[header::ACCEPT_RANGES], "bytes");
    assert_eq!(headers[header::CONTENT_LENGTH], "4");
    assert_eq!(headers[header::ACCESS_CONTROL_ALLOW_ORIGIN], VELA);
    assert!(varies_by_origin(headers));
    let exposed = listed(headers, header::ACCESS_CONTROL_EXPOSE_HEADERS);
    for name in [
        "content-range",
        "accept-ranges",
        "content-length",
        "x-pyxis-candidate-id",
    ] {
        assert!(exposed.iter().any(|entry| entry == name), "{name}");
    }
    let bytes = to_bytes(response.into_body(), 1024).await.expect("body");
    assert_eq!(&bytes[..], b"2345");
}

#[tokio::test]
async fn a_stream_failure_is_readable_by_an_allowed_origin_only() {
    let (_directory, app) = app_with_local_track(VELA);

    let allowed = send(&app, stream(VELA, None, "bytes=0-1")).await;
    assert_eq!(allowed.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(allowed.headers()[header::ACCESS_CONTROL_ALLOW_ORIGIN], VELA);

    for origin in LOOKALIKES {
        let refused = send(&app, stream(origin, None, "bytes=0-1")).await;
        assert!(!refused
            .headers()
            .contains_key(header::ACCESS_CONTROL_ALLOW_ORIGIN));
    }
}

struct Server {
    address: SocketAddr,
    _directory: TempDir,
}

async fn serve(origins: &str) -> Server {
    let directory = tempfile::tempdir().expect("temp dir");
    let state = state(&directory, origins);
    let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
    let address = listener.local_addr().expect("address");
    tokio::spawn(async move {
        let _ = axum::serve(listener, router(state)).await;
    });
    Server {
        address,
        _directory: directory,
    }
}

async fn http_claim(server: &Server) -> String {
    let body = reqwest::Client::new()
        .post(format!("http://{}/rpc", server.address))
        .header("content-type", "application/json")
        .body(json!({ "_tag": "auth.device.claim", "payload": { "name": "car" } }).to_string())
        .send()
        .await
        .expect("claim")
        .text()
        .await
        .expect("claim body");
    serde_json::from_str::<Value>(&body).expect("claim JSON")["outcome"]["value"]["bearerToken"]
        .as_str()
        .expect("bearer token")
        .to_string()
}

/// Open `/realtime` as a browser would, with an optional `Origin`, then say hello.
async fn open_socket(server: &Server, origin: Option<&str>) -> Result<Value, SocketError> {
    let mut request = format!("ws://{}/realtime", server.address)
        .into_client_request()
        .expect("socket request");
    if let Some(origin) = origin {
        request
            .headers_mut()
            .insert(header::ORIGIN, origin.parse().expect("origin header"));
    }
    let (mut socket, _) = tokio_tungstenite::connect_async(request).await?;
    let token = http_claim(server).await;
    socket
        .send(Message::Text(
            json!({
                "_tag": "realtime.hello",
                "payload": {
                    "bearerToken": token,
                    "topics": ["sessions"],
                    "contractId": pyxis::rpc::contract::CONTRACT_ID
                }
            })
            .to_string(),
        ))
        .await
        .expect("send hello");
    loop {
        let frame = tokio::time::timeout(Duration::from_secs(5), socket.next())
            .await
            .expect("frame in time")
            .expect("open socket")
            .expect("frame");
        if let Message::Text(text) = frame {
            return Ok(serde_json::from_str(&text).expect("JSON frame"));
        }
    }
}

#[tokio::test]
async fn realtime_accepts_allowed_same_origin_and_originless_clients() {
    let server = serve(VELA).await;
    let same_origin = format!("http://{}", server.address);

    for origin in [Some(VELA), Some(same_origin.as_str()), None] {
        let welcome = open_socket(&server, origin).await.expect("upgrade");
        assert_eq!(welcome["_tag"], "realtime.welcome", "{origin:?}");
    }
}

#[tokio::test]
async fn realtime_accepts_same_origin_with_an_empty_allowlist() {
    let server = serve("").await;
    let same_origin = format!("http://{}", server.address);

    let welcome = open_socket(&server, Some(&same_origin))
        .await
        .expect("upgrade");
    assert_eq!(welcome["_tag"], "realtime.welcome");
}

#[tokio::test]
async fn realtime_refuses_foreign_and_lookalike_origins_before_upgrading() {
    let server = serve(VELA).await;
    let other_port = format!("http://127.0.0.1:{}", server.address.port() + 1);

    for origin in LOOKALIKES
        .into_iter()
        .chain(["https://elsewhere.test", other_port.as_str()])
    {
        match open_socket(&server, Some(origin)).await {
            Err(SocketError::Http(response)) => {
                assert_eq!(response.status(), StatusCode::FORBIDDEN, "{origin}");
                let body: Value =
                    serde_json::from_slice(response.body().as_deref().expect("failure body"))
                        .expect("JSON failure");
                assert_eq!(body["_tag"], "realtime.failure");
                assert_eq!(body["payload"]["code"], "realtime.originRefused");
                assert_eq!(body["payload"]["retryable"], false);
            }
            other => panic!("{origin}: expected a refused upgrade, got {other:?}"),
        }
    }
}
