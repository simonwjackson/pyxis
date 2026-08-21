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

#[tokio::test]
async fn album_search_and_get_register_playable_internal_tracks() {
    let dir = tempfile::tempdir().expect("temp dir");
    let candidate =
        PluginCandidate::new(PathBuf::from(env!("CARGO_BIN_EXE_pyxis-plugin-laboratory")))
            .with_env("PYXIS_LAB_ID", "album-source")
            .with_env("PYXIS_LAB_BEHAVIOR", "ready")
            .with_env("PYXIS_LAB_ALBUM", "external-album|Heroes|David Bowie");
    let host = PluginHost::start(vec![candidate], HostPolicy::default()).expect("host");
    let live = host.clone();
    let state = AppState::open_with_plugins(Store::open(dir.path()).unwrap(), host).unwrap();
    let media = state.media.clone();
    let app = router(state);
    let claim = rpc(
        &app,
        json!({ "_tag": "auth.device.claim", "payload": { "name": "album" } }),
        None,
    )
    .await;
    let token = claim["outcome"]["value"]["bearerToken"].as_str().unwrap();

    let search = rpc(
        &app,
        json!({
            "_tag": "source.album.search",
            "payload": { "pluginId": "album-source", "query": "Heroes David Bowie" }
        }),
        Some(token),
    )
    .await;
    assert_eq!(search["outcome"]["value"][0]["title"], "Heroes");

    let album = rpc(
        &app,
        json!({
            "_tag": "source.album.get",
            "payload": { "pluginId": "album-source", "externalId": "external-album" }
        }),
        Some(token),
    )
    .await;
    let track = &album["outcome"]["value"]["tracks"][0];
    assert_eq!(track["trackNumber"], 1);
    let track_id = track["id"].as_str().unwrap();
    assert!(!track_id.contains("album-source"));
    assert!(matches!(
        media
            .resolve(&AccountId::new("default"), track_id, &live.live_ids())
            .unwrap(),
        ResolveOutcome::Ready(_)
    ));
}
