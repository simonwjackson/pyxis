use axum::body::{to_bytes, Body};
use axum::http::{Request, StatusCode};
use pyxis::api::{router_with_web, AppState};
use pyxis::db::store::Store;
use tower::ServiceExt;

#[tokio::test]
async fn installed_web_root_serves_assets_and_spa_fallback_without_shadowing_api() {
    let dir = tempfile::tempdir().expect("temp dir");
    let web = dir.path().join("web");
    std::fs::create_dir_all(&web).expect("web dir");
    std::fs::write(web.join("index.html"), "<h1>reference shell</h1>").expect("index");
    std::fs::write(web.join("asset.txt"), "asset bytes").expect("asset");
    let state =
        AppState::open(Store::open(&dir.path().join("state")).expect("store")).expect("state");
    let app = router_with_web(state, Some(web));

    for path in ["/", "/library/deep-link"] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(path)
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            to_bytes(response.into_body(), 1024).await.unwrap(),
            "<h1>reference shell</h1>"
        );
    }

    let asset = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/asset.txt")
                .body(Body::empty())
                .expect("request"),
        )
        .await
        .expect("asset response");
    assert_eq!(
        to_bytes(asset.into_body(), 1024).await.unwrap(),
        "asset bytes"
    );

    let health = app
        .oneshot(
            Request::builder()
                .uri("/healthz")
                .body(Body::empty())
                .expect("request"),
        )
        .await
        .expect("health response");
    assert_eq!(health.status(), StatusCode::OK);
}

#[tokio::test]
async fn the_shell_is_never_stored_while_hashed_assets_are_kept_for_a_year() {
    let dir = tempfile::tempdir().expect("temp dir");
    let web = dir.path().join("web");
    std::fs::create_dir_all(web.join("assets")).expect("web dir");
    std::fs::write(web.join("index.html"), "<h1>shell</h1>").expect("index");
    std::fs::write(web.join("assets/index-abc123.js"), "bundle").expect("asset");

    // Reproduce the condition that makes this hard: every file in the Nix store carries
    // the same zeroed mtime, so a browser's validator matches a build it has never seen.
    let nix_epoch = std::time::UNIX_EPOCH + std::time::Duration::from_secs(1);
    let times = std::fs::FileTimes::new()
        .set_accessed(nix_epoch)
        .set_modified(nix_epoch);
    std::fs::File::options()
        .write(true)
        .open(web.join("index.html"))
        .expect("open index")
        .set_times(times)
        .expect("zero the shell mtime");
    let state =
        AppState::open(Store::open(&dir.path().join("state")).expect("store")).expect("state");
    let app = router_with_web(state, Some(web));

    // The shell names the hashed assets, so a cached copy pins the client to an old build.
    // Every file in the Nix store shares a zeroed mtime, so revalidation cannot be trusted
    // to notice a change either.
    for path in ["/", "/library/deep-link"] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(path)
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(
            response
                .headers()
                .get("cache-control")
                .map(|v| v.to_str().unwrap()),
            Some("no-store"),
            "{path} must not be stored"
        );
    }

    // A browser holding the previous shell revalidates with the mtime every Nix build
    // shares. Answering 304 there is how a reload keeps returning the old client, so the
    // shell must refuse to take the question.
    for header in ["if-modified-since", "if-none-match"] {
        let revalidated = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/")
                    .header(header, "Thu, 01 Jan 1970 00:00:01 GMT")
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(
            revalidated.status(),
            StatusCode::OK,
            "{header} must not win"
        );
        assert_eq!(
            to_bytes(revalidated.into_body(), 1024).await.unwrap(),
            "<h1>shell</h1>"
        );
    }

    // Nothing that would let a cache ask again next time.
    let shell = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/")
                .body(Body::empty())
                .expect("request"),
        )
        .await
        .expect("response");
    assert!(shell.headers().get("last-modified").is_none());
    assert!(shell.headers().get("etag").is_none());

    let asset = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/assets/index-abc123.js")
                .body(Body::empty())
                .expect("request"),
        )
        .await
        .expect("asset response");
    assert_eq!(asset.status(), StatusCode::OK);
    assert_eq!(
        asset
            .headers()
            .get("cache-control")
            .map(|v| v.to_str().unwrap()),
        Some("public, max-age=31536000, immutable"),
    );
    assert_eq!(to_bytes(asset.into_body(), 1024).await.unwrap(), "bundle");

    // A miss during a deploy must not be remembered for a year.
    let missing = app
        .oneshot(
            Request::builder()
                .uri("/assets/index-gone.js")
                .body(Body::empty())
                .expect("request"),
        )
        .await
        .expect("missing response");
    assert_eq!(missing.status(), StatusCode::NOT_FOUND);
    assert!(missing.headers().get("cache-control").is_none());
}
