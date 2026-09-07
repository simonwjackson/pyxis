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
async fn one_search_returns_albums_artists_and_songs() {
    let dir = tempfile::tempdir().expect("temp dir");
    let store = Store::open(dir.path()).expect("store");
    let candidate = search_plugin()
        .with_env("PYXIS_LAB_ALBUM", "MPRE_album|Heroes|David Bowie")
        .with_env("PYXIS_LAB_ARTIST", "UC1234567890123456789012|David Bowie");
    let host = PluginHost::start(vec![candidate], HostPolicy::default()).expect("host");
    let state = AppState::open_with_plugins(store, host).expect("state");
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

    let value = &result["outcome"]["value"];
    assert_eq!(result["outcome"]["status"], "ready");
    assert_eq!(value["tracks"][0]["title"], "Heroes");
    assert_eq!(value["albums"][0]["externalId"], "MPRE_album");
    assert_eq!(value["albums"][0]["sourcePluginId"], "search-source");
    assert_eq!(
        value["artists"][0]["externalId"],
        "UC1234567890123456789012"
    );
    assert_eq!(value["artists"][0]["name"], "David Bowie");
    assert_eq!(value["artists"][0]["sourcePluginId"], "search-source");
    assert_eq!(value["failures"].as_array().expect("failures").len(), 0);
}

#[tokio::test]
async fn a_source_that_cannot_search_every_kind_is_not_a_failure() {
    let dir = tempfile::tempdir().expect("temp dir");
    let store = Store::open(dir.path()).expect("store");
    let host = PluginHost::start(vec![search_plugin()], HostPolicy::default()).expect("host");
    let state = AppState::open_with_plugins(store, host).expect("state");
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

    let value = &result["outcome"]["value"];
    assert_eq!(result["outcome"]["status"], "ready");
    assert_eq!(value["tracks"].as_array().expect("tracks").len(), 1);
    assert_eq!(value["artists"].as_array().expect("artists").len(), 0);
    assert_eq!(value["failures"].as_array().expect("failures").len(), 0);
}

#[tokio::test]
async fn every_result_kind_honours_the_requested_limit() {
    let dir = tempfile::tempdir().expect("temp dir");
    let store = Store::open(dir.path()).expect("store");
    let candidate = search_plugin()
        .with_env("PYXIS_LAB_ALBUM", "MPRE_album|Heroes|David Bowie")
        .with_env("PYXIS_LAB_ARTIST", "UC1234567890123456789012|David Bowie")
        .with_env("PYXIS_LAB_RESULT_COPIES", "4");
    let host = PluginHost::start(vec![candidate], HostPolicy::default()).expect("host");
    let state = AppState::open_with_plugins(store, host).expect("state");
    let app = router(state);
    let token = claim(&app).await;

    let result = rpc(
        &app,
        json!({
            "_tag": "source.search.run",
            "payload": { "query": "Bowie", "limit": 2 }
        }),
        Some(&token),
    )
    .await;

    let value = &result["outcome"]["value"];
    assert_eq!(value["tracks"].as_array().expect("tracks").len(), 2);
    assert_eq!(value["albums"].as_array().expect("albums").len(), 2);
    assert_eq!(value["artists"].as_array().expect("artists").len(), 2);
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
