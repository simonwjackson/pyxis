use std::path::PathBuf;

use axum::body::{to_bytes, Body};
use axum::http::{header, Request, StatusCode};
use pyxis::api::{router, AppState};
use pyxis::db::schema;
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

#[tokio::test]
async fn concurrent_album_get_registers_one_candidate_per_source_track() {
    let dir = tempfile::tempdir().expect("temp dir");
    let candidate =
        PluginCandidate::new(PathBuf::from(env!("CARGO_BIN_EXE_pyxis-plugin-laboratory")))
            .with_env("PYXIS_LAB_ID", "album-source")
            .with_env("PYXIS_LAB_BEHAVIOR", "ready")
            .with_env("PYXIS_LAB_ALBUM", "external-album|Heroes|David Bowie");
    let host = PluginHost::start(vec![candidate], HostPolicy::default()).expect("host");
    let store = Store::open(dir.path()).unwrap();
    let app = router(AppState::open_with_plugins(store.clone(), host).unwrap());
    let claim = rpc(
        &app,
        json!({ "_tag": "auth.device.claim", "payload": { "name": "album" } }),
        None,
    )
    .await;
    let token = claim["outcome"]["value"]["bearerToken"].as_str().unwrap();
    let request = json!({
        "_tag": "source.album.get",
        "payload": { "pluginId": "album-source", "externalId": "external-album" }
    });

    let (first, second) = tokio::join!(
        rpc(&app, request.clone(), Some(token)),
        rpc(&app, request, Some(token))
    );

    assert_eq!(first["outcome"]["status"], "ready");
    assert_eq!(second["outcome"]["status"], "ready");
    assert_eq!(
        store
            .list::<Value>(schema::TRACK_CANDIDATES, &AccountId::new("default"))
            .unwrap()
            .len(),
        1
    );
}

#[tokio::test]
async fn malformed_album_output_is_permanent_and_has_no_candidate_side_effects() {
    let dir = tempfile::tempdir().expect("temp dir");
    let candidate =
        PluginCandidate::new(PathBuf::from(env!("CARGO_BIN_EXE_pyxis-plugin-laboratory")))
            .with_env("PYXIS_LAB_ID", "malformed-album")
            .with_env("PYXIS_LAB_BEHAVIOR", "ready")
            .with_env("PYXIS_LAB_ALBUM", "external-album|Heroes|David Bowie")
            .with_env("PYXIS_LAB_ALBUM_MODE", "duplicate-track");
    let host = PluginHost::start(vec![candidate], HostPolicy::default()).expect("host");
    let store = Store::open(dir.path()).unwrap();
    let app = router(AppState::open_with_plugins(store.clone(), host).unwrap());
    let claim = rpc(
        &app,
        json!({ "_tag": "auth.device.claim", "payload": { "name": "album" } }),
        None,
    )
    .await;
    let token = claim["outcome"]["value"]["bearerToken"].as_str().unwrap();

    let album = rpc(
        &app,
        json!({
            "_tag": "source.album.get",
            "payload": { "pluginId": "malformed-album", "externalId": "external-album" }
        }),
        Some(token),
    )
    .await;

    assert_eq!(album["outcome"]["status"], "unavailable");
    assert_eq!(album["outcome"]["value"]["retryable"], false);
    assert!(store
        .list::<Value>(schema::TRACK_CANDIDATES, &AccountId::new("default"))
        .unwrap()
        .is_empty());
}

#[tokio::test]
async fn unknown_album_plugin_is_a_permanent_failure() {
    let dir = tempfile::tempdir().expect("temp dir");
    let app = router(AppState::open(Store::open(dir.path()).unwrap()).unwrap());
    let claim = rpc(
        &app,
        json!({ "_tag": "auth.device.claim", "payload": { "name": "album" } }),
        None,
    )
    .await;
    let token = claim["outcome"]["value"]["bearerToken"].as_str().unwrap();

    let album = rpc(
        &app,
        json!({
            "_tag": "source.album.get",
            "payload": { "pluginId": "missing", "externalId": "external-album" }
        }),
        Some(token),
    )
    .await;

    assert_eq!(album["outcome"]["status"], "unavailable");
    assert_eq!(album["outcome"]["value"]["retryable"], false);
}

#[tokio::test]
async fn corrupt_plugin_credentials_are_a_permanent_album_failure() {
    let dir = tempfile::tempdir().expect("temp dir");
    let store = Store::open(dir.path()).unwrap();
    let account = AccountId::new("default");
    let credential_id =
        blake3::hash(b"plugin-credential\0default\0corrupt").to_hex()[..26].to_string();
    store
        .put(
            schema::PLUGIN_CREDENTIALS,
            &account,
            &credential_id,
            &json!({
                "pluginId": "corrupt",
                "ciphertext": "not-base64",
                "nonce": "not-base64",
                "revision": 1,
                "updatedBy": "test",
                "updatedAt": "now"
            }),
        )
        .expect("corrupt credential");
    let app = router(AppState::open(store).unwrap());
    let claim = rpc(
        &app,
        json!({ "_tag": "auth.device.claim", "payload": { "name": "album" } }),
        None,
    )
    .await;
    let token = claim["outcome"]["value"]["bearerToken"].as_str().unwrap();

    let album = rpc(
        &app,
        json!({
            "_tag": "source.album.get",
            "payload": { "pluginId": "corrupt", "externalId": "external-album" }
        }),
        Some(token),
    )
    .await;

    assert_eq!(album["outcome"]["status"], "unavailable");
    assert_eq!(album["outcome"]["value"]["retryable"], false);
    assert_eq!(
        album["outcome"]["value"]["code"],
        "source.albumCredentialsInvalid"
    );
}

#[tokio::test]
async fn malformed_plugin_credential_record_is_a_permanent_album_failure() {
    let dir = tempfile::tempdir().expect("temp dir");
    let store = Store::open(dir.path()).unwrap();
    let account = AccountId::new("default");
    let credential_id =
        blake3::hash(b"plugin-credential\0default\0malformed").to_hex()[..26].to_string();
    store
        .put(
            schema::PLUGIN_CREDENTIALS,
            &account,
            &credential_id,
            &json!({
                "pluginId": "malformed",
                "ciphertext": "AA==",
                "nonce": "AA==",
                "revision": -1,
                "updatedBy": "test",
                "updatedAt": "now"
            }),
        )
        .expect("malformed credential");
    let app = router(AppState::open(store).unwrap());
    let claim = rpc(
        &app,
        json!({ "_tag": "auth.device.claim", "payload": { "name": "album" } }),
        None,
    )
    .await;
    let token = claim["outcome"]["value"]["bearerToken"].as_str().unwrap();

    let album = rpc(
        &app,
        json!({
            "_tag": "source.album.get",
            "payload": { "pluginId": "malformed", "externalId": "external-album" }
        }),
        Some(token),
    )
    .await;

    assert_eq!(album["outcome"]["status"], "unavailable");
    assert_eq!(album["outcome"]["value"]["retryable"], false);
    assert_eq!(
        album["outcome"]["value"]["code"],
        "source.albumCredentialsInvalid"
    );
}

#[tokio::test]
async fn permanent_plugin_album_failure_stays_permanent_at_rpc_boundary() {
    let dir = tempfile::tempdir().expect("temp dir");
    let candidate =
        PluginCandidate::new(PathBuf::from(env!("CARGO_BIN_EXE_pyxis-plugin-laboratory")))
            .with_env("PYXIS_LAB_ID", "permanent-album")
            .with_env("PYXIS_LAB_BEHAVIOR", "album-permanent")
            .with_env("PYXIS_LAB_ALBUM", "external-album|Heroes|David Bowie");
    let host = PluginHost::start(vec![candidate], HostPolicy::default()).expect("host");
    let app = router(AppState::open_with_plugins(Store::open(dir.path()).unwrap(), host).unwrap());
    let claim = rpc(
        &app,
        json!({ "_tag": "auth.device.claim", "payload": { "name": "album" } }),
        None,
    )
    .await;
    let token = claim["outcome"]["value"]["bearerToken"].as_str().unwrap();

    let album = rpc(
        &app,
        json!({
            "_tag": "source.album.get",
            "payload": { "pluginId": "permanent-album", "externalId": "external-album" }
        }),
        Some(token),
    )
    .await;

    assert_eq!(album["outcome"]["status"], "unavailable");
    assert_eq!(album["outcome"]["value"]["retryable"], false);
}
