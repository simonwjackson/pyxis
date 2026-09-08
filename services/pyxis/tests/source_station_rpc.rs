//! Stations as one generic model, proved against real plugin subprocesses.
//!
//! Every source here is the same laboratory plugin under different configuration. That is
//! deliberate: the point of the model is that a source is interchangeable, so the tests must
//! not depend on which provider is behind an answer.

use std::path::PathBuf;

use axum::body::{to_bytes, Body};
use axum::http::{header, Request, StatusCode};
use pyxis::api::{router, AppState};
use pyxis::db::store::Store;
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
            "payload": { "name": "station test" }
        }),
        None,
    )
    .await["outcome"]["value"]["bearerToken"]
        .as_str()
        .expect("token")
        .to_string()
}

/// A source shaped like Pandora: it owns stations, lists them, and accepts seeds.
fn station_source(id: &str) -> PluginCandidate {
    PluginCandidate::new(PathBuf::from(env!("CARGO_BIN_EXE_pyxis-plugin-laboratory")))
        .with_env("PYXIS_LAB_ID", id)
        .with_env("PYXIS_LAB_BEHAVIOR", "ready")
        .with_env("PYXIS_LAB_STATION", format!("{id}-station|{id} Radio"))
        .with_env("PYXIS_LAB_STATION_LIST", format!("{id}-station|{id} Radio"))
        .with_env("PYXIS_LAB_STATION_SEEDS", "track,artist")
}

/// A source shaped like YouTube Music: stations are derived from a seed and never listed.
fn derived_station_source(id: &str) -> PluginCandidate {
    PluginCandidate::new(PathBuf::from(env!("CARGO_BIN_EXE_pyxis-plugin-laboratory")))
        .with_env("PYXIS_LAB_ID", id)
        .with_env("PYXIS_LAB_BEHAVIOR", "ready")
        .with_env("PYXIS_LAB_STATION", format!("{id}-station|{id} Radio"))
        .with_env("PYXIS_LAB_STATION_SEEDS", "track")
        .with_env("PYXIS_LAB_SEARCH", "Idioteque|Radiohead|Kid A|310000")
}

async fn app_with(candidates: Vec<PluginCandidate>) -> (axum::Router, String, tempfile::TempDir) {
    let dir = tempfile::tempdir().expect("temp dir");
    let store = Store::open(dir.path()).expect("store");
    let host = PluginHost::start(candidates, HostPolicy::default()).expect("host");
    let state = AppState::open_with_plugins(store, host).expect("state");
    let app = router(state);
    let token = claim(&app).await;
    (app, token, dir)
}

#[tokio::test]
async fn a_seed_produces_a_station_and_a_first_batch() {
    let (app, token, _dir) = app_with(vec![station_source("pandora-like")]).await;

    let created = rpc(
        &app,
        json!({
            "_tag": "source.station.create",
            "payload": {
                "pluginId": "pandora-like",
                "seed": { "kind": "track", "externalId": "seed-track" }
            }
        }),
        Some(&token),
    )
    .await;

    assert_eq!(created["outcome"]["status"], "ready");
    let station_id = created["outcome"]["value"]["externalId"]
        .as_str()
        .expect("station id")
        .to_string();
    assert_eq!(
        created["outcome"]["value"]["sourcePluginId"],
        "pandora-like"
    );

    let batch = rpc(
        &app,
        json!({
            "_tag": "source.station.next",
            "payload": { "pluginId": "pandora-like", "stationId": station_id }
        }),
        Some(&token),
    )
    .await;

    let value = &batch["outcome"]["value"];
    assert_eq!(batch["outcome"]["status"], "ready");
    assert_eq!(value["tracks"][0]["title"], "Station Song");
    assert_eq!(value["tracks"][0]["sourcePluginId"], "pandora-like");
    assert_eq!(value["exhausted"], false);
    assert!(value["cursor"].is_string());
}

#[tokio::test]
async fn stations_from_every_source_appear_in_one_list() {
    let (app, token, _dir) = app_with(vec![station_source("alpha"), station_source("beta")]).await;

    let result = rpc(
        &app,
        json!({ "_tag": "source.station.list", "payload": {} }),
        Some(&token),
    )
    .await;

    let value = &result["outcome"]["value"];
    assert_eq!(result["outcome"]["status"], "ready");
    let sources: Vec<_> = value["stations"]
        .as_array()
        .expect("stations")
        .iter()
        .map(|station| station["sourcePluginId"].as_str().expect("source"))
        .collect();
    assert!(sources.contains(&"alpha"));
    assert!(sources.contains(&"beta"));
    assert_eq!(value["failures"].as_array().expect("failures").len(), 0);
}

#[tokio::test]
async fn a_source_that_lists_no_stations_is_not_a_failure() {
    let (app, token, _dir) = app_with(vec![derived_station_source("ytmusic-like")]).await;

    let result = rpc(
        &app,
        json!({ "_tag": "source.station.list", "payload": {} }),
        Some(&token),
    )
    .await;

    let value = &result["outcome"]["value"];
    assert_eq!(result["outcome"]["status"], "ready");
    assert_eq!(value["stations"].as_array().expect("stations").len(), 0);
    assert_eq!(value["failures"].as_array().expect("failures").len(), 0);
}

#[tokio::test]
async fn one_failing_source_does_not_remove_another_sources_stations() {
    let failing =
        PluginCandidate::new(PathBuf::from(env!("CARGO_BIN_EXE_pyxis-plugin-laboratory")))
            .with_env("PYXIS_LAB_ID", "broken")
            .with_env("PYXIS_LAB_BEHAVIOR", "station-unavailable")
            .with_env("PYXIS_LAB_STATION_LIST", "broken-station|Broken Radio");
    let (app, token, _dir) = app_with(vec![station_source("healthy"), failing]).await;

    let result = rpc(
        &app,
        json!({ "_tag": "source.station.list", "payload": {} }),
        Some(&token),
    )
    .await;

    let value = &result["outcome"]["value"];
    assert_eq!(result["outcome"]["status"], "ready");
    assert_eq!(value["stations"][0]["sourcePluginId"], "healthy");
    assert_eq!(value["failures"][0]["pluginId"], "broken");
    assert_eq!(value["failures"][0]["failure"]["code"], "plugin.station");
}

#[tokio::test]
async fn stations_with_no_source_plugins_is_an_honest_no_sources_outcome() {
    let (app, token, _dir) = app_with(Vec::new()).await;

    let result = rpc(
        &app,
        json!({ "_tag": "source.station.list", "payload": {} }),
        Some(&token),
    )
    .await;

    assert_eq!(result["outcome"]["status"], "noSources");
}

#[tokio::test]
async fn a_batch_is_bounded_by_the_requested_limit() {
    let source = station_source("bounded").with_env("PYXIS_LAB_RESULT_COPIES", "6");
    let (app, token, _dir) = app_with(vec![source]).await;

    let batch = rpc(
        &app,
        json!({
            "_tag": "source.station.next",
            "payload": {
                "pluginId": "bounded",
                "stationId": "bounded-station",
                "limit": 2
            }
        }),
        Some(&token),
    )
    .await;

    assert_eq!(
        batch["outcome"]["value"]["tracks"]
            .as_array()
            .expect("tracks")
            .len(),
        2
    );
}

#[tokio::test]
async fn a_continued_batch_reaches_the_end_of_the_station() {
    let (app, token, _dir) = app_with(vec![station_source("continuing")]).await;

    let first = rpc(
        &app,
        json!({
            "_tag": "source.station.next",
            "payload": { "pluginId": "continuing", "stationId": "continuing-station" }
        }),
        Some(&token),
    )
    .await;
    let cursor = first["outcome"]["value"]["cursor"]
        .as_str()
        .expect("cursor")
        .to_string();

    let second = rpc(
        &app,
        json!({
            "_tag": "source.station.next",
            "payload": {
                "pluginId": "continuing",
                "stationId": "continuing-station",
                "cursor": cursor
            }
        }),
        Some(&token),
    )
    .await;

    let value = &second["outcome"]["value"];
    assert_eq!(second["outcome"]["status"], "ready");
    assert_eq!(value["exhausted"], true);
    assert!(value["cursor"].is_null());
}

#[tokio::test]
async fn a_cursor_is_refused_against_a_different_station() {
    let (app, token, _dir) = app_with(vec![station_source("bound-cursor")]).await;

    let first = rpc(
        &app,
        json!({
            "_tag": "source.station.next",
            "payload": { "pluginId": "bound-cursor", "stationId": "bound-cursor-station" }
        }),
        Some(&token),
    )
    .await;
    let cursor = first["outcome"]["value"]["cursor"]
        .as_str()
        .expect("cursor")
        .to_string();

    let replayed = rpc(
        &app,
        json!({
            "_tag": "source.station.next",
            "payload": {
                "pluginId": "bound-cursor",
                "stationId": "somebody-elses-station",
                "cursor": cursor
            }
        }),
        Some(&token),
    )
    .await;

    assert_eq!(replayed["outcome"]["status"], "unknownStation");
}

#[tokio::test]
async fn an_unknown_cursor_is_refused_like_one_that_never_existed() {
    let (app, token, _dir) = app_with(vec![station_source("unknown-cursor")]).await;

    let result = rpc(
        &app,
        json!({
            "_tag": "source.station.next",
            "payload": {
                "pluginId": "unknown-cursor",
                "stationId": "unknown-cursor-station",
                "cursor": "invented"
            }
        }),
        Some(&token),
    )
    .await;

    assert_eq!(result["outcome"]["status"], "unknownStation");
}

#[tokio::test]
async fn an_undeclared_seed_kind_is_refused_without_asking_the_source() {
    // The laboratory source declares track and artist seeds, never album.
    let (app, token, _dir) = app_with(vec![station_source("declaring")]).await;

    let result = rpc(
        &app,
        json!({
            "_tag": "source.station.create",
            "payload": {
                "pluginId": "declaring",
                "seed": { "kind": "album", "externalId": "some-album" }
            }
        }),
        Some(&token),
    )
    .await;

    assert_eq!(result["outcome"]["status"], "unsupportedSeed");
}

#[tokio::test]
async fn plugin_list_publishes_the_seed_kinds_a_client_can_offer() {
    let (app, token, _dir) = app_with(vec![station_source("declaring")]).await;

    let result = rpc(
        &app,
        json!({ "_tag": "plugin.list", "payload": {} }),
        Some(&token),
    )
    .await;

    let plugin = result["outcome"]["value"]
        .as_array()
        .expect("plugins")
        .iter()
        .find(|plugin| plugin["id"] == "declaring")
        .expect("declaring plugin")
        .clone();
    let kinds: Vec<_> = plugin["stationSeedKinds"]
        .as_array()
        .expect("seed kinds")
        .iter()
        .map(|kind| kind.as_str().expect("kind"))
        .collect();
    assert_eq!(kinds, vec!["track", "artist"]);
}

#[tokio::test]
async fn a_search_result_carries_the_id_that_seeds_its_station() {
    // Radio has to start somewhere a listener actually is, and that is a song they just found.
    // A search result used to publish only the core's account-scoped id, which means nothing to
    // a plugin, so a client could list and play stations but never begin one.
    let (app, token, _dir) = app_with(vec![derived_station_source("radio-like")]).await;

    let found = rpc(
        &app,
        json!({ "_tag": "source.search.run", "payload": { "query": "anything", "limit": 1 } }),
        Some(&token),
    )
    .await;
    assert_eq!(found["outcome"]["status"], "ready");
    let track = &found["outcome"]["value"]["tracks"][0];
    let external_id = track["externalId"]
        .as_str()
        .expect("externalId")
        .to_string();
    assert_ne!(
        external_id,
        track["id"].as_str().expect("id"),
        "the source's reference must not be the core's account-scoped id"
    );

    // The seed round-trips: what search published is what station.create accepts.
    let created = rpc(
        &app,
        json!({
            "_tag": "source.station.create",
            "payload": {
                "pluginId": track["sourcePluginId"],
                "seed": { "kind": "track", "externalId": external_id }
            }
        }),
        Some(&token),
    )
    .await;
    assert_eq!(created["outcome"]["status"], "ready");

    let batch = rpc(
        &app,
        json!({
            "_tag": "source.station.next",
            "payload": {
                "pluginId": "radio-like",
                "stationId": created["outcome"]["value"]["externalId"],
                "limit": 2
            }
        }),
        Some(&token),
    )
    .await;
    assert_eq!(batch["outcome"]["status"], "ready");
    assert!(
        !batch["outcome"]["value"]["tracks"]
            .as_array()
            .expect("tracks")
            .is_empty(),
        "a station seeded from a search result must play something"
    );
}
