use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use axum::body::{to_bytes, Body};
use axum::extract::State;
use axum::http::{header, Request, StatusCode};
use axum::response::IntoResponse;
use axum::routing::get;
use axum::Router;
use pyxis::api::{router, AppState};
use pyxis::db::store::{AccountId, Store};
use pyxis::media::{Fidelity, LocalCandidateInput, PluginCandidateInput};
use pyxis::plugins::host::{HostPolicy, PluginCandidate, PluginHost};
use serde_json::{json, Value};
use tempfile::TempDir;
use tokio::net::TcpListener;
use tower::ServiceExt;

const AUDIO: &[u8] = b"0123456789-audio-bytes";

struct Upstream {
    url: String,
    requests: Arc<AtomicUsize>,
    task: tokio::task::JoinHandle<()>,
}

impl Drop for Upstream {
    fn drop(&mut self) {
        self.task.abort();
    }
}

async fn upstream(status: StatusCode) -> Upstream {
    async fn audio(
        State((requests, status)): State<(Arc<AtomicUsize>, StatusCode)>,
    ) -> impl IntoResponse {
        requests.fetch_add(1, Ordering::SeqCst);
        (status, [(header::CONTENT_TYPE, "audio/webm")], AUDIO)
    }

    let requests = Arc::new(AtomicUsize::new(0));
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind upstream");
    let address = listener.local_addr().expect("upstream address");
    let app = Router::new()
        .route("/audio", get(audio))
        .with_state((requests.clone(), status));
    let task = tokio::spawn(async move {
        axum::serve(listener, app).await.expect("serve upstream");
    });
    Upstream {
        url: format!("http://{address}/audio"),
        requests,
        task,
    }
}

async fn range_required_upstream() -> Upstream {
    async fn audio(
        State(requests): State<Arc<AtomicUsize>>,
        headers: axum::http::HeaderMap,
    ) -> axum::response::Response {
        requests.fetch_add(1, Ordering::SeqCst);
        let Some(range) = headers
            .get(header::RANGE)
            .and_then(|value| value.to_str().ok())
        else {
            return StatusCode::FORBIDDEN.into_response();
        };
        let Some(bounds) = range.strip_prefix("bytes=") else {
            return StatusCode::RANGE_NOT_SATISFIABLE.into_response();
        };
        let Some((start, end)) = bounds.split_once('-') else {
            return StatusCode::RANGE_NOT_SATISFIABLE.into_response();
        };
        let Ok(start) = start.parse::<usize>() else {
            return StatusCode::RANGE_NOT_SATISFIABLE.into_response();
        };
        let Ok(requested_end) = end.parse::<usize>() else {
            return StatusCode::RANGE_NOT_SATISFIABLE.into_response();
        };
        if start >= AUDIO.len() {
            return StatusCode::RANGE_NOT_SATISFIABLE.into_response();
        }
        let end = requested_end.min(AUDIO.len() - 1);
        (
            StatusCode::PARTIAL_CONTENT,
            [
                (header::CONTENT_TYPE, "audio/webm".to_string()),
                (
                    header::CONTENT_RANGE,
                    format!("bytes {start}-{end}/{}", AUDIO.len()),
                ),
            ],
            &AUDIO[start..=end],
        )
            .into_response()
    }

    let requests = Arc::new(AtomicUsize::new(0));
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind upstream");
    let address = listener.local_addr().expect("upstream address");
    let app = Router::new()
        .route("/audio", get(audio))
        .with_state(requests.clone());
    let task = tokio::spawn(async move {
        axum::serve(listener, app).await.expect("serve upstream");
    });
    Upstream {
        url: format!("http://{address}/audio"),
        requests,
        task,
    }
}

fn laboratory(url: &str) -> PluginCandidate {
    PluginCandidate::new(PathBuf::from(env!("CARGO_BIN_EXE_pyxis-plugin-laboratory")))
        .with_env("PYXIS_LAB_ID", "stream-source")
        .with_env("PYXIS_LAB_BEHAVIOR", "ready")
        .with_env("PYXIS_LAB_STREAM_URL", url)
}

fn refreshing_laboratory(expired_url: &str, fresh_url: &str) -> PluginCandidate {
    laboratory(expired_url).with_env("PYXIS_LAB_STREAM_URL_SECOND", fresh_url)
}

fn state_with_remote(url: &str) -> (TempDir, AppState) {
    let dir = tempfile::tempdir().expect("temp dir");
    let store = Store::open(dir.path()).expect("open store");
    let plugins = PluginHost::start(vec![laboratory(url)], HostPolicy::default()).expect("host");
    let state = AppState::open_with_plugins(store, plugins).expect("app state");
    state
        .media
        .add_plugin_candidate(
            &AccountId::new("default"),
            "track-1",
            PluginCandidateInput {
                plugin_id: "stream-source".into(),
                external_id: "external-1".into(),
                format: Some("webm/opus".into()),
                fidelity: Fidelity {
                    lossless: false,
                    bitrate_kbps: Some(128),
                    sample_rate_hz: Some(48_000),
                },
                source_priority: 10,
            },
            "test",
        )
        .expect("candidate");
    (dir, state)
}

async fn body(response: axum::response::Response) -> Vec<u8> {
    to_bytes(response.into_body(), 1024 * 1024)
        .await
        .expect("body")
        .to_vec()
}

async fn json_body(response: axum::response::Response) -> Value {
    serde_json::from_slice(&body(response).await).expect("JSON")
}

async fn claim(app: &Router) -> String {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/rpc")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    json!({
                        "_tag": "auth.device.claim",
                        "payload": { "name": "stream test" }
                    })
                    .to_string(),
                ))
                .expect("claim request"),
        )
        .await
        .expect("claim response");
    json_body(response).await["outcome"]["value"]["bearerToken"]
        .as_str()
        .expect("token")
        .to_string()
}

fn stream_request(token: &str, range: Option<&str>) -> Request<Body> {
    let mut request = Request::builder()
        .uri("/stream/track-1")
        .header(header::AUTHORIZATION, format!("Bearer {token}"));
    if let Some(range) = range {
        request = request.header(header::RANGE, range);
    }
    request.body(Body::empty()).expect("stream request")
}

#[tokio::test]
async fn full_file_is_cached_and_served_with_audio_metadata() {
    let upstream = upstream(StatusCode::OK).await;
    let (_dir, state) = state_with_remote(&upstream.url);
    let app = router(state);
    let token = claim(&app).await;

    let response = app
        .clone()
        .oneshot(stream_request(&token, None))
        .await
        .expect("stream response");

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()[header::CONTENT_TYPE], "audio/webm");
    assert_eq!(response.headers()[header::ACCEPT_RANGES], "bytes");
    assert_eq!(body(response).await, AUDIO);
    assert_eq!(upstream.requests.load(Ordering::SeqCst), 1);

    let cached = app
        .oneshot(stream_request(&token, None))
        .await
        .expect("cached response");
    assert_eq!(body(cached).await, AUDIO);
    assert_eq!(upstream.requests.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn a_range_required_upstream_is_downloaded_into_the_cache() {
    let upstream = range_required_upstream().await;
    let (_dir, state) = state_with_remote(&upstream.url);
    let app = router(state);
    let token = claim(&app).await;

    let response = app
        .oneshot(stream_request(&token, None))
        .await
        .expect("stream response");

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(body(response).await, AUDIO);
    assert_eq!(upstream.requests.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn range_request_returns_206_with_exact_bounds() {
    let upstream = upstream(StatusCode::OK).await;
    let (_dir, state) = state_with_remote(&upstream.url);
    let app = router(state);
    let token = claim(&app).await;

    let response = app
        .oneshot(stream_request(&token, Some("bytes=2-5")))
        .await
        .expect("range response");

    assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
    assert_eq!(response.headers()[header::CONTENT_RANGE], "bytes 2-5/22");
    assert_eq!(response.headers()[header::CONTENT_LENGTH], "4");
    assert_eq!(body(response).await, b"2345");
}

#[tokio::test]
async fn concurrent_cold_requests_fetch_upstream_once() {
    let upstream = upstream(StatusCode::OK).await;
    let (_dir, state) = state_with_remote(&upstream.url);
    let app = router(state);
    let token = claim(&app).await;

    let first = app.clone().oneshot(stream_request(&token, None));
    let second = app.clone().oneshot(stream_request(&token, None));
    let (first, second) = tokio::join!(first, second);

    assert_eq!(body(first.expect("first")).await, AUDIO);
    assert_eq!(body(second.expect("second")).await, AUDIO);
    assert_eq!(upstream.requests.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn local_candidate_is_served_without_calling_upstream() {
    let upstream = upstream(StatusCode::OK).await;
    let (dir, state) = state_with_remote(&upstream.url);
    let source = dir.path().join("local.webm");
    std::fs::write(&source, b"local-hi-fi").expect("local source");
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
    let app = router(state);
    let token = claim(&app).await;

    let response = app
        .oneshot(stream_request(&token, None))
        .await
        .expect("local response");

    assert_eq!(body(response).await, b"local-hi-fi");
    assert_eq!(upstream.requests.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn upstream_failure_is_typed_and_never_becomes_a_cached_partial() {
    let upstream = upstream(StatusCode::INTERNAL_SERVER_ERROR).await;
    let (_dir, state) = state_with_remote(&upstream.url);
    let app = router(state);
    let token = claim(&app).await;

    for expected_count in 1..=2 {
        let response = app
            .clone()
            .oneshot(stream_request(&token, None))
            .await
            .expect("failure response");
        assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
        let failure = json_body(response).await;
        assert_eq!(failure["_tag"], "stream.failure");
        assert_eq!(failure["failure"]["code"], "upstream.status");
        assert_eq!(upstream.requests.load(Ordering::SeqCst), expected_count);
    }
}

#[tokio::test]
async fn an_expired_plugin_url_is_resolved_once_more_before_failing() {
    let expired = upstream(StatusCode::FORBIDDEN).await;
    let fresh = upstream(StatusCode::OK).await;
    let dir = tempfile::tempdir().expect("temp dir");
    let store = Store::open(dir.path()).expect("open store");
    let plugins = PluginHost::start(
        vec![refreshing_laboratory(&expired.url, &fresh.url)],
        HostPolicy::default(),
    )
    .expect("host");
    let state = AppState::open_with_plugins(store, plugins).expect("state");
    state
        .media
        .add_plugin_candidate(
            &AccountId::new("default"),
            "track-1",
            PluginCandidateInput {
                plugin_id: "stream-source".into(),
                external_id: "external-1".into(),
                format: Some("webm/opus".into()),
                fidelity: Fidelity {
                    lossless: false,
                    bitrate_kbps: Some(128),
                    sample_rate_hz: Some(48_000),
                },
                source_priority: 10,
            },
            "test",
        )
        .expect("candidate");
    let app = router(state);
    let token = claim(&app).await;

    let response = app
        .oneshot(stream_request(&token, None))
        .await
        .expect("stream response");

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(body(response).await, AUDIO);
    assert_eq!(expired.requests.load(Ordering::SeqCst), 1);
    assert_eq!(fresh.requests.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn client_bound_urls_fall_back_to_plugin_directed_file_fetch() {
    let forbidden = upstream(StatusCode::FORBIDDEN).await;
    let dir = tempfile::tempdir().expect("temp dir");
    let store = Store::open(dir.path()).expect("open store");
    let candidate = laboratory(&forbidden.url).with_env("PYXIS_LAB_FETCH_BYTES", "plugin-fetched");
    let plugins = PluginHost::start(vec![candidate], HostPolicy::default()).expect("host");
    let state = AppState::open_with_plugins(store, plugins).expect("state");
    state
        .media
        .add_plugin_candidate(
            &AccountId::new("default"),
            "track-1",
            PluginCandidateInput {
                plugin_id: "stream-source".into(),
                external_id: "external-1".into(),
                format: Some("webm/opus".into()),
                fidelity: Fidelity {
                    lossless: false,
                    bitrate_kbps: Some(128),
                    sample_rate_hz: Some(48_000),
                },
                source_priority: 10,
            },
            "test",
        )
        .expect("candidate");
    let app = router(state);
    let token = claim(&app).await;

    let response = app
        .oneshot(stream_request(&token, None))
        .await
        .expect("stream response");

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(body(response).await, b"plugin-fetched");
    assert_eq!(forbidden.requests.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn stream_requires_an_account_bearer() {
    let upstream = upstream(StatusCode::OK).await;
    let (_dir, state) = state_with_remote(&upstream.url);

    let response = router(state)
        .oneshot(
            Request::builder()
                .uri("/stream/track-1")
                .body(Body::empty())
                .expect("request"),
        )
        .await
        .expect("response");

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(
        json_body(response).await["failure"]["code"],
        "auth.required"
    );
}
