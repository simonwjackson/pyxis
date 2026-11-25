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
        .header(header::CONTENT_TYPE, "application/json")
        .header("x-pyxis-contract", pyxis::rpc::contract::CONTRACT_ID);
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
    let source = &value["tracks"][0];
    let lookup = rpc(
        &app,
        json!({"_tag":"library.tracks.get", "payload":{"trackIds":[source["id"]]}}),
        Some(&token),
    )
    .await;
    let metadata = &lookup["outcome"]["value"]["tracks"][0];
    assert_eq!(metadata["title"], source["title"]);
    assert_eq!(metadata["artist"], source["artist"]);
    assert_eq!(metadata["durationMs"], source["durationMs"]);
    assert_eq!(metadata["albumTitle"], source["album"]);
    assert!(metadata.get("albumId").is_none());
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
    assert_eq!(value["playlists"], json!([]));
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

#[tokio::test]
async fn rediscovery_replaces_the_persisted_label_including_removed_fields() {
    let dir = tempfile::tempdir().unwrap();
    let open = |candidate| {
        let host = PluginHost::start(vec![candidate], HostPolicy::default()).unwrap();
        router(AppState::open_with_plugins(Store::open(dir.path()).unwrap(), host).unwrap())
    };
    let app = open(search_plugin());
    let token = claim(&app).await;
    let search = json!({"_tag":"source.search.run","payload":{"query":"Bowie"}});
    let first = rpc(&app, search.clone(), Some(&token)).await;
    let id = first["outcome"]["value"]["tracks"][0]["id"]
        .as_str()
        .unwrap();
    let lookup = json!({"_tag":"library.tracks.get","payload":{"trackIds":[id]}});
    let first_label = rpc(&app, lookup.clone(), Some(&token)).await;
    assert_eq!(
        first_label["outcome"]["value"]["tracks"][0],
        json!({"id":id,"title":"Heroes","artist":"David Bowie","albumTitle":"Heroes","durationMs":372000})
    );
    drop(app);

    let app = open(search_plugin().with_env("PYXIS_LAB_SEARCH", "Revised title|David Bowie"));
    let updated = rpc(&app, search, Some(&token)).await;
    assert_eq!(updated["outcome"]["value"]["tracks"][0]["id"], id);
    drop(app);

    let app = router(AppState::open(Store::open(dir.path()).unwrap()).unwrap());
    let read = rpc(&app, lookup, Some(&token)).await;
    assert_eq!(
        read["outcome"]["value"],
        json!({"tracks":[{"id":id,"title":"Revised title","artist":"David Bowie"}],"misses":[]})
    );
}

#[tokio::test]
async fn search_pages_resume_only_the_issuing_plugin_kind_and_query() {
    let source = |id| {
        search_plugin()
            .with_env("PYXIS_LAB_ID", id)
            .with_env("PYXIS_LAB_ALBUM", "album|Heroes|David Bowie")
            .with_env("PYXIS_LAB_ARTIST", "artist|David Bowie")
            .with_env("PYXIS_LAB_CONTINUATION", "private")
    };
    let dir = tempfile::tempdir().unwrap();
    let host =
        PluginHost::start(vec![source("one"), source("two")], HostPolicy::default()).unwrap();
    let app = router(AppState::open_with_plugins(Store::open(dir.path()).unwrap(), host).unwrap());
    let token = claim(&app).await;
    let first = rpc(
        &app,
        json!({"_tag":"source.search.run","payload":{"query":"Bowie"}}),
        Some(&token),
    )
    .await;
    let pages = first["outcome"]["value"]["pages"].as_array().unwrap();
    assert_eq!(pages.len(), 6);
    for page in pages {
        let kind = page["kind"].as_str().unwrap();
        let result = rpc(
            &app,
            json!({"_tag":"source.search.run","payload":{"query":"Bowie","page":page}}),
            Some(&token),
        )
        .await;
        let value = &result["outcome"]["value"];
        assert_eq!(result["outcome"]["status"], "ready");
        assert!(value["pages"].is_null());
        assert_eq!(value["failures"], json!([]));
        assert_eq!(value[kind][0]["sourcePluginId"], page["pluginId"]);
        for section in ["albums", "artists", "tracks"] {
            assert_eq!(
                value[section].as_array().unwrap().len(),
                usize::from(kind == section)
            );
        }
    }
    let issued = &pages[0];
    let mut wrong_kind = issued.clone();
    wrong_kind["kind"] = json!(if issued["kind"] == "tracks" {
        "albums"
    } else {
        "tracks"
    });
    let mut wrong_source = issued.clone();
    wrong_source["pluginId"] = json!(if issued["pluginId"] == "one" {
        "two"
    } else {
        "one"
    });
    let mut tampered = issued.clone();
    let token_text = issued["cursor"].as_str().unwrap();
    let replacement = if token_text.starts_with('A') {
        "B"
    } else {
        "A"
    };
    tampered["cursor"] = json!(format!("{replacement}{}", &token_text[1..]));
    for (query, page) in [
        ("Bowie", &wrong_kind),
        ("Bowie", &wrong_source),
        ("other", issued),
        ("Bowie", &tampered),
    ] {
        let refused = rpc(
            &app,
            json!({"_tag":"source.search.run","payload":{"query":query,"page":page}}),
            Some(&token),
        )
        .await;
        assert_eq!(refused["outcome"]["status"], "invalid");
    }
}

#[tokio::test]
async fn declared_catalog_pages_are_bounded_and_query_sealed() {
    let dir = tempfile::tempdir().unwrap();
    let reads = json!({"playlist.search":{"playlists":[{"externalId":"a","title":"A"},{"externalId":"b","title":"B"}],"cursor":"raw"},"search.suggest":{"items":["a","b"],"cursor":"raw"}});
    let host = PluginHost::start(
        vec![search_plugin().with_env("PYXIS_LAB_READS", reads.to_string())],
        HostPolicy::default(),
    )
    .unwrap();
    let app = router(AppState::open_with_plugins(Store::open(dir.path()).unwrap(), host).unwrap());
    let token = claim(&app).await;
    let search = rpc(
        &app,
        json!({"_tag":"source.search.run","payload":{"query":"a","limit":1}}),
        Some(&token),
    )
    .await;
    assert_eq!(
        search["outcome"]["value"]["playlists"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert_ne!(
        search["outcome"]["value"]["pages"][0]["cursor"]
            .as_str()
            .unwrap(),
        "raw"
    );
    let mut req = json!({"_tag":"source.search.suggest","payload":{"pluginId":"search-source","query":"a","limit":1}});
    let page = rpc(&app, req.clone(), Some(&token)).await;
    assert_eq!(page["outcome"]["value"]["items"], json!(["a"]), "{page}");
    req["payload"]["cursor"] = page["outcome"]["value"]["cursor"].clone();
    req["payload"]["query"] = "b".into();
    assert_eq!(
        rpc(&app, req, Some(&token)).await["outcome"]["status"],
        "invalid"
    );
}

#[tokio::test]
async fn related_tracks_are_playable_but_not_saved_and_discography_pages_bind_artist() {
    let dir = tempfile::tempdir().unwrap();
    let reads = json!({"track.related":{"items":[{"source":"lab","externalId":"recording","title":"Related","artist":"Artist"}],"cursor":"next"},"artist.discography":{"items":[{"externalId":"release","title":"Single","artist":"Artist","releaseType":"single"}],"cursor":"next"}});
    let host = PluginHost::start(
        vec![search_plugin().with_env("PYXIS_LAB_READS", reads.to_string())],
        HostPolicy::default(),
    )
    .unwrap();
    let app = router(AppState::open_with_plugins(Store::open(dir.path()).unwrap(), host).unwrap());
    let token = claim(&app).await;
    let read = |tag: &str, id: &str| json!({"_tag":tag,"payload":{"pluginId":"search-source","externalId":id}});
    let page = rpc(&app, read("source.track.related", "seed"), Some(&token)).await;
    let track = &page["outcome"]["value"]["items"][0];
    assert_eq!(track["externalId"], "recording");
    let lookup = rpc(
        &app,
        json!({"_tag":"library.tracks.get","payload":{"trackIds":[track["id"]]}}),
        Some(&token),
    )
    .await;
    assert_eq!(lookup["outcome"]["value"]["tracks"][0]["title"], "Related");
    assert!(lookup["outcome"]["value"]["tracks"][0]
        .get("albumId")
        .is_none());
    let page = rpc(
        &app,
        read("source.artist.discography", "artist"),
        Some(&token),
    )
    .await;
    assert_eq!(
        page["outcome"]["value"]["items"][0]["releaseType"],
        "single"
    );
    let mut wrong = read("source.artist.discography", "other");
    wrong["payload"]["cursor"] = page["outcome"]["value"]["cursor"].clone();
    assert_eq!(
        rpc(&app, wrong, Some(&token)).await["outcome"]["status"],
        "invalid"
    );
}

#[tokio::test]
async fn lyrics_distinguish_plain_and_timed_lines_from_an_unsupported_source() {
    let dir = tempfile::tempdir().unwrap();
    let lyrics = json!({"status":"found","value":{"lines":[{"text":"plain"},{"text":"timed","startMs":320}]}});
    let host = PluginHost::start(
        vec![search_plugin().with_env(
            "PYXIS_LAB_READS",
            json!({"track.lyrics":lyrics}).to_string(),
        )],
        HostPolicy::default(),
    )
    .unwrap();
    let app = router(AppState::open_with_plugins(Store::open(dir.path()).unwrap(), host).unwrap());
    let token = claim(&app).await;
    let read = |plugin: &str| json!({"_tag":"source.track.lyrics","payload":{"pluginId":plugin,"externalId":"recording"}});
    assert_eq!(
        rpc(&app, read("search-source"), Some(&token)).await["outcome"],
        json!({"status":"ready","value":lyrics})
    );
    assert_eq!(
        rpc(&app, read("absent"), Some(&token)).await["outcome"]["status"],
        "unsupported"
    );
}

#[tokio::test]
async fn a_search_page_must_fit_the_resume_request_with_its_query() {
    // Leave one byte on the safe side of the paging budget. The next source's
    // continuation is two raw bytes longer and crosses it after sealing.
    let mut query = "\"".repeat(450_000); // Each quote takes two bytes on the wire.
    let plugin_id = "search-source";
    let prefix = "x".repeat(4096);
    for extra in ["", "xx"] {
        let dir = tempfile::tempdir().unwrap();
        let host = PluginHost::start(
            vec![search_plugin().with_env("PYXIS_LAB_CONTINUATION", format!("{prefix}{extra}"))],
            HostPolicy::default(),
        )
        .unwrap();
        let app =
            router(AppState::open_with_plugins(Store::open(dir.path()).unwrap(), host).unwrap());
        let bearer = claim(&app).await;
        let request = |query: &str| json!({"_tag":"source.search.run","payload":{"query":query}});
        if extra.is_empty() {
            let probe = rpc(&app, request("size probe"), Some(&bearer)).await;
            let token_len = probe["outcome"]["value"]["pages"][0]["cursor"]
                .as_str()
                .unwrap()
                .len();
            let varying_bytes = json!(["default", plugin_id, "search", {"query": &query}])
                .to_string()
                .len();
            let remaining = 1024 * 1024 - 1024 - varying_bytes - token_len;
            query.push_str(&"q".repeat(remaining - 1));
        }
        let first = rpc(&app, request(&query), Some(&bearer)).await;
        if extra.is_empty() {
            assert_eq!(first["outcome"]["status"], "ready");
            assert!(first["outcome"]["value"]["pages"][0]["cursor"].is_string());
            let mut next = request(&query);
            next["payload"]["page"] = first["outcome"]["value"]["pages"][0].clone();
            let resumed = rpc(&app, next, Some(&bearer)).await;
            assert_eq!(resumed["outcome"]["status"], "ready");
            assert!(resumed["outcome"]["value"]["pages"].is_null());
            assert_eq!(resumed["outcome"]["value"]["failures"], json!([]));
        } else {
            assert_eq!(first["outcome"]["status"], "unavailable");
        }
    }
}

#[tokio::test]
async fn positional_playlist_rows_are_rejected() {
    let dir = tempfile::tempdir().unwrap();
    let reads =
        json!({"playlist.search":{"playlists":[["id","title",null,null,null,"another-source"]]}});
    let host = PluginHost::start(
        vec![search_plugin().with_env("PYXIS_LAB_READS", reads.to_string())],
        HostPolicy::default(),
    )
    .unwrap();
    let app = router(AppState::open_with_plugins(Store::open(dir.path()).unwrap(), host).unwrap());
    let token = claim(&app).await;
    let search = rpc(
        &app,
        json!({"_tag":"source.search.run","payload":{"query":"one"}}),
        Some(&token),
    )
    .await;
    assert_eq!(search["outcome"]["value"]["playlists"], json!([]));
    assert_eq!(
        search["outcome"]["value"]["failures"][0]["failure"]["code"],
        "plugin.invalidSearch"
    );
}

#[tokio::test]
async fn positional_source_pages_and_discography_rows_are_rejected() {
    let dir = tempfile::tempdir().unwrap();
    let reads = json!({"artist.discography":{"items":[[null,"id","title","artist",null,null,"another-source"]]},"search.suggest":[["one","two"],"raw-secret"]});
    let host = PluginHost::start(
        vec![search_plugin().with_env("PYXIS_LAB_READS", reads.to_string())],
        HostPolicy::default(),
    )
    .unwrap();
    let app = router(AppState::open_with_plugins(Store::open(dir.path()).unwrap(), host).unwrap());
    let token = claim(&app).await;
    for (tag, payload) in [
        (
            "source.search.suggest",
            json!({"pluginId":"search-source","query":"one","limit":1}),
        ),
        (
            "source.artist.discography",
            json!({"pluginId":"search-source","externalId":"artist"}),
        ),
    ] {
        let page = rpc(&app, json!({"_tag":tag,"payload":payload}), Some(&token)).await;
        assert_eq!(page["outcome"]["status"], "unavailable");
        assert!(!page.to_string().contains("raw-secret"));
    }
}

#[tokio::test]
async fn atomic_metadata_reads_send_only_the_documented_selectors() {
    let dir = tempfile::tempdir().unwrap();
    let log = dir.path().join("inputs");
    let reads = json!({"track.details":{"items":[]},"track.credits":[],"track.lyrics":{"status":"notFound"}});
    let host = PluginHost::start(
        vec![search_plugin()
            .with_env("PYXIS_LAB_READS", reads.to_string())
            .with_env("PYXIS_LAB_CALL_LOG", log.to_str().unwrap())],
        HostPolicy::default(),
    )
    .unwrap();
    let app = router(AppState::open_with_plugins(Store::open(dir.path()).unwrap(), host).unwrap());
    let token = claim(&app).await;
    for (op, selector) in [
        ("track.details", json!({"externalIds":["id"]})),
        ("track.credits", json!({"externalId":"id"})),
        ("track.lyrics", json!({"externalId":"id"})),
    ] {
        let mut payload = selector.clone();
        payload["pluginId"] = "search-source".into();
        let result = rpc(
            &app,
            json!({"_tag":format!("source.{op}"),"payload":payload}),
            Some(&token),
        )
        .await;
        assert_eq!(result["outcome"]["status"], "ready", "{result}");
        let calls = std::fs::read_to_string(&log).unwrap();
        assert!(
            calls.lines().any(|line| line == format!("{op}|{selector}")),
            "{calls}"
        );
    }
}
