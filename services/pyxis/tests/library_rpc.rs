use axum::body::{to_bytes, Body};
use axum::http::{header, Request, StatusCode};
use pyxis::api::{router, AppState};
use pyxis::db::store::Store;
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

async fn token(app: &axum::Router) -> String {
    rpc(
        app,
        json!({
            "_tag": "auth.device.claim",
            "payload": { "name": "library test" }
        }),
        None,
    )
    .await["outcome"]["value"]["bearerToken"]
        .as_str()
        .expect("token")
        .to_string()
}

fn add_request() -> Value {
    json!({
        "_tag": "library.album.add",
        "payload": {
            "title": "Heroes",
            "artist": "David Bowie",
            "year": 1977,
            "artworkUrl": "https://img.example/heroes.jpg",
            "sourceReference": {
                "pluginId": "ytmusic",
                "externalId": "album-heroes"
            },
            "tracks": [{
                "id": "track-heroes",
                "title": "Heroes",
                "artist": "David Bowie",
                "durationMs": 372000,
                "trackNumber": 3
            }]
        }
    })
}

#[tokio::test]
async fn album_add_list_placement_and_remove_are_one_coherent_public_contract() {
    let dir = tempfile::tempdir().expect("temp dir");
    let app = router(AppState::open(Store::open(dir.path()).expect("store")).expect("state"));
    let token = token(&app).await;

    let added = rpc(&app, add_request(), Some(&token)).await;
    assert_eq!(added["outcome"]["status"], "ready");
    assert_eq!(added["outcome"]["value"]["placement"], "discovery");
    let album_id = added["outcome"]["value"]["id"].as_str().expect("album id");

    let duplicate = rpc(&app, add_request(), Some(&token)).await;
    assert_eq!(duplicate["outcome"]["value"]["id"], album_id);

    let moved = rpc(
        &app,
        json!({
            "_tag": "library.album.command.run",
            "payload": {
                "albumId": album_id,
                "command": {
                    "_tag": "placement.set",
                    "payload": { "placement": "collection" }
                }
            }
        }),
        Some(&token),
    )
    .await;
    assert_eq!(moved["outcome"]["status"], "applied");
    assert_eq!(moved["outcome"]["value"]["revision"], 2);

    let listed = rpc(
        &app,
        json!({ "_tag": "library.albums.list", "payload": {} }),
        Some(&token),
    )
    .await;
    assert_eq!(listed["outcome"]["value"].as_array().unwrap().len(), 1);
    assert_eq!(
        listed["outcome"]["value"][0]["tracks"][0]["id"],
        "track-heroes"
    );
    assert_eq!(
        listed["outcome"]["value"][0]["artworkUrl"],
        "https://img.example/heroes.jpg"
    );
    assert_eq!(
        listed["outcome"]["value"][0]["tracks"][0]["artworkUrl"],
        "https://img.example/heroes.jpg"
    );

    let removed = rpc(
        &app,
        json!({
            "_tag": "library.album.command.run",
            "payload": {
                "albumId": album_id,
                "command": { "_tag": "remove", "payload": {} }
            }
        }),
        Some(&token),
    )
    .await;
    assert_eq!(removed["outcome"]["status"], "removed");
}

#[tokio::test]
async fn bookmark_and_playlist_operations_are_account_scoped() {
    let dir = tempfile::tempdir().expect("temp dir");
    let app = router(AppState::open(Store::open(dir.path()).expect("store")).expect("state"));
    let token = token(&app).await;

    let bookmarked = rpc(
        &app,
        json!({
            "_tag": "library.bookmark.command.run",
            "payload": {
                "trackId": "track-1",
                "command": { "_tag": "add", "payload": {} }
            }
        }),
        Some(&token),
    )
    .await;
    assert_eq!(bookmarked["outcome"]["status"], "added");

    let bookmarks = rpc(
        &app,
        json!({ "_tag": "library.bookmarks.list", "payload": {} }),
        Some(&token),
    )
    .await;
    assert_eq!(bookmarks["outcome"]["value"][0]["trackId"], "track-1");

    let playlist = rpc(
        &app,
        json!({
            "_tag": "library.playlist.create",
            "payload": { "title": "Bowie", "trackIds": ["track-1"] }
        }),
        Some(&token),
    )
    .await;
    assert_eq!(playlist["outcome"]["status"], "ready");

    let playlists = rpc(
        &app,
        json!({ "_tag": "library.playlists.list", "payload": {} }),
        Some(&token),
    )
    .await;
    assert_eq!(playlists["outcome"]["value"][0]["title"], "Bowie");
}

#[tokio::test]
async fn playlist_append_preserves_duplicates_receipts_and_account_boundaries() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(dir.path()).unwrap();
    let app = router(AppState::open(store.clone()).unwrap());
    let bearer = token(&app).await;
    rpc(&app, add_request(), Some(&bearer)).await;
    let created = rpc(
        &app,
        json!({"_tag":"library.playlist.create", "payload":{"title":"Bowie", "trackIds":[]}}),
        Some(&bearer),
    )
    .await;
    let id = created["outcome"]["value"]["id"].as_str().unwrap();
    let append = json!({"_tag":"library.playlist.tracks.add", "payload":{"playlistId":id,"trackIds":["track-heroes","track-heroes"],"commandId":"append-1"}});
    let first = rpc(&app, append.clone(), Some(&bearer)).await;
    assert_eq!(first["outcome"]["status"], "applied");
    assert_eq!(
        first["outcome"]["value"]["trackIds"],
        json!(["track-heroes", "track-heroes"])
    );
    assert_eq!(first["outcome"]["value"]["revision"], 2);
    assert_eq!(rpc(&app, append.clone(), Some(&bearer)).await, first);
    let mut different = append.clone();
    different["payload"]["trackIds"] = json!(["track-heroes"]);
    assert_eq!(
        rpc(&app, different, Some(&bearer)).await["outcome"]["value"]["code"],
        "library.commandIdConflict"
    );
    let mut second = append.clone();
    second["payload"]["commandId"] = json!("append-2");
    assert_eq!(
        rpc(&app, second, Some(&bearer)).await["outcome"]["value"]["trackIds"]
            .as_array()
            .unwrap()
            .len(),
        4
    );
    let mut invalid = append.clone();
    invalid["payload"]["commandId"] = json!("missing-track");
    invalid["payload"]["trackIds"] = json!(["not-owned"]);
    assert_eq!(
        rpc(&app, invalid, Some(&bearer)).await["outcome"]["status"],
        "rejected"
    );
    let other = rpc(
        &app,
        json!({"_tag":"account.create", "payload":{"name":"Other", "deviceName":"Other"}}),
        Some(&bearer),
    )
    .await;
    let other_token = other["outcome"]["value"]["bearerToken"].as_str().unwrap();
    assert_eq!(
        rpc(&app, append.clone(), Some(other_token)).await["outcome"]["status"],
        "unknownPlaylist"
    );
    drop(app);
    drop(store);
    let app = router(AppState::open(Store::open(dir.path()).unwrap()).unwrap());
    assert_eq!(rpc(&app, append, Some(&bearer)).await, first);
}

#[tokio::test]
async fn groups_tags_and_pages_are_account_fenced_and_survive_reopen() {
    let dir = tempfile::tempdir().unwrap();
    let app = router(AppState::open(Store::open(dir.path()).unwrap()).unwrap());
    let bearer = token(&app).await;
    let added = rpc(&app, add_request(), Some(&bearer)).await;
    let album_id = added["outcome"]["value"]["id"].as_str().unwrap();
    let tags = json!({"_tag":"library.album.command.run", "payload":{"albumId":album_id,"command":{"_tag":"tags.set","payload":{"tags":[" Road Trip ","road trip","FAVORITE"]}}}});
    let tagged = rpc(&app, tags.clone(), Some(&bearer)).await;
    assert_eq!(tagged["outcome"]["status"], "applied");
    assert_eq!(
        tagged["outcome"]["value"]["tags"],
        json!(["favorite", "road trip"])
    );
    assert_eq!(
        rpc(&app, tags.clone(), Some(&bearer)).await["outcome"]["value"]["revision"],
        2
    );
    let moved = rpc(&app, json!({"_tag":"library.album.command.run","payload":{"albumId":album_id,"command":{"_tag":"placement.set","payload":{"placement":"collection"}}}}), Some(&bearer)).await;
    assert_eq!(
        moved["outcome"]["value"]["tags"],
        json!(["favorite", "road trip"])
    );
    let mut second = add_request();
    second["payload"]["title"] = json!("Low");
    second["payload"]["sourceReference"]["externalId"] = json!("low");
    rpc(&app, second, Some(&bearer)).await;
    let listed = rpc(
        &app,
        json!({"_tag":"library.groups.list","payload":{}}),
        Some(&bearer),
    )
    .await;
    let groups = listed["outcome"]["value"].as_array().unwrap();
    let labels: Vec<_> = groups
        .iter()
        .map(|group| group["label"].as_str().unwrap())
        .collect();
    assert_eq!(
        labels,
        [
            "Albums",
            "Discovery",
            "Collection",
            "Archive",
            "Dismissed",
            "Hot albums",
            "favorite",
            "road trip",
            "Bookmarks",
            "Stations",
            "Playlists"
        ]
    );
    assert_eq!(groups[0]["count"], 2);
    assert_eq!(groups[9]["count"], 0);
    let group = groups[0]["id"].as_str().unwrap();
    let page_request =
        json!({"_tag":"library.group.items.list", "payload":{"groupId":group,"limit":1}});
    let page = rpc(&app, page_request.clone(), Some(&bearer)).await;
    assert_eq!(
        page["outcome"]["value"]["items"].as_array().unwrap().len(),
        1
    );
    assert_eq!(page["outcome"]["value"]["items"][0]["_tag"], "album");
    let cursor = page["outcome"]["value"]["cursor"].as_str().unwrap();
    let next = json!({"_tag":"library.group.items.list", "payload":{"groupId":group,"cursor":cursor,"limit":1}});
    let tail = rpc(&app, next.clone(), Some(&bearer)).await;
    assert!(tail["outcome"]["value"].get("cursor").is_none());
    assert_ne!(
        page["outcome"]["value"]["items"][0],
        tail["outcome"]["value"]["items"][0]
    );
    let mut wrong = next.clone();
    wrong["payload"]["groupId"] = groups[1]["id"].clone();
    assert_eq!(
        rpc(&app, wrong, Some(&bearer)).await["outcome"]["value"]["code"],
        "library.invalidCursor"
    );
    let other = rpc(
        &app,
        json!({"_tag":"account.create", "payload":{"name":"Other","deviceName":"Other"}}),
        Some(&bearer),
    )
    .await;
    let other_token = other["outcome"]["value"]["bearerToken"].as_str().unwrap();
    assert_eq!(
        rpc(&app, next, Some(other_token)).await["outcome"]["value"]["code"],
        "library.invalidCursor"
    );
    assert_eq!(
        rpc(&app, page_request, Some(other_token)).await["outcome"]["status"],
        "unknownGroup"
    );
    let mut bad_tags = tags;
    bad_tags["payload"]["command"]["payload"]["tags"] = json!(["bad\nlabel"]);
    assert_eq!(
        rpc(&app, bad_tags, Some(&bearer)).await["outcome"]["value"]["retryable"],
        false
    );
    drop(app);
    let app = router(AppState::open(Store::open(dir.path()).unwrap()).unwrap());
    let albums = rpc(
        &app,
        json!({"_tag":"library.albums.list","payload":{}}),
        Some(&bearer),
    )
    .await;
    let persisted = albums["outcome"]["value"]
        .as_array()
        .unwrap()
        .iter()
        .find(|album| album["id"] == album_id)
        .unwrap();
    assert_eq!(persisted["tags"], json!(["favorite", "road trip"]));
}
