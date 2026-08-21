use std::path::PathBuf;

use axum::body::{to_bytes, Body};
use axum::http::{header, Request, StatusCode};
use pyxis::api::{router, AppState};
use pyxis::db::store::{AccountId, Store};
use pyxis::media::ResolveOutcome;
use pyxis::plugins::host::{HostPolicy, PluginCandidate, PluginHost};
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

async fn claim(app: &axum::Router) -> String {
    rpc(
        app,
        json!({
            "_tag": "auth.device.claim",
            "payload": { "name": "search test" }
        }),
        None,
    )
    .await["outcome"]["value"]["bearerToken"]
        .as_str()
        .expect("token")
        .to_string()
}

fn search_plugin() -> PluginCandidate {
    PluginCandidate::new(PathBuf::from(env!("CARGO_BIN_EXE_pyxis-plugin-laboratory")))
        .with_env("PYXIS_LAB_ID", "search-source")
        .with_env("PYXIS_LAB_BEHAVIOR", "ready")
        .with_env("PYXIS_LAB_SEARCH", "Heroes|David Bowie|Heroes|372000")
}

#[tokio::test]
async fn search_returns_canonical_tracks_and_registers_playable_candidates() {
    let dir = tempfile::tempdir().expect("temp dir");
    let store = Store::open(dir.path()).expect("store");
    let host = PluginHost::start(vec![search_plugin()], HostPolicy::default()).expect("host");
    let plugins = host.clone();
    let state = AppState::open_with_plugins(store, host).expect("state");
    let media = state.media.clone();
    let app = router(state);
    let token = claim(&app).await;

    let result = rpc(
        &app,
        json!({
            "_tag": "source.search.run",
            "payload": { "query": "Bowie", "limit": 5 }
        }),
        Some(&token),
    )
    .await;

    assert_eq!(result["outcome"]["status"], "ready");
    let track = &result["outcome"]["value"]["tracks"][0];
    assert_eq!(track["title"], "Heroes");
    assert_eq!(track["artist"], "David Bowie");
    assert_eq!(track["sourcePluginId"], "search-source");
    let track_id = track["id"].as_str().expect("track id");
    assert!(!track_id.contains("search-source"));

    assert!(matches!(
        media
            .resolve(&AccountId::new("default"), track_id, &plugins.live_ids())
            .expect("resolve"),
        ResolveOutcome::Ready(_)
    ));
}

#[tokio::test]
async fn search_with_no_source_plugins_is_an_honest_no_sources_outcome() {
    let dir = tempfile::tempdir().expect("temp dir");
    let state = AppState::open(Store::open(dir.path()).expect("store")).expect("state");
    let app = router(state);
    let token = claim(&app).await;

    let result = rpc(
        &app,
        json!({
            "_tag": "source.search.run",
            "payload": { "query": "Bowie", "limit": 5 }
        }),
        Some(&token),
    )
    .await;

    assert_eq!(result["outcome"]["status"], "noSources");
}
