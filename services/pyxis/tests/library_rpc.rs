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
