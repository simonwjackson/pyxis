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
