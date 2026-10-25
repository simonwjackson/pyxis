use axum::body::{to_bytes, Body};
use axum::http::{header, Request};
use pyxis::api::{router, AppState};
use pyxis::db::{
    schema,
    store::{AccountId, Store},
};
use serde_json::{json, Value};
use tower::ServiceExt;

async fn rpc(app: &axum::Router, request: Value, token: Option<&str>) -> Value {
    let mut builder = Request::builder()
        .method("POST")
        .uri("/rpc")
        .header(header::CONTENT_TYPE, "application/json")
        .header("x-pyxis-contract", pyxis::rpc::contract::CONTRACT_ID);
    if let Some(token) = token {
        builder = builder.header(header::AUTHORIZATION, format!("Bearer {token}"));
    }
    let response = app
        .clone()
        .oneshot(builder.body(Body::from(request.to_string())).unwrap())
        .await
        .unwrap();
    serde_json::from_slice(&to_bytes(response.into_body(), 1024 * 1024).await.unwrap()).unwrap()
}

async fn command(app: &axum::Router, token: &str, id: &str, command: Value) -> Value {
    let result = rpc(
        app,
        json!({"_tag":"session.command.run","payload":{"sessionId":id,"command":command}}),
        Some(token),
    )
    .await;
    assert_eq!(result["outcome"]["status"], "applied", "{result}");
    result["outcome"]["value"].clone()
}

#[tokio::test]
async fn reversible_shuffle_preserves_current_duplicate_occurrence_position_and_edits() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(dir.path()).unwrap();
    let app = router(AppState::open(store.clone()).unwrap());
    let claim = rpc(
        &app,
        json!({"_tag":"auth.device.claim","payload":{"name":"Modes"}}),
        None,
    )
    .await;
    let token = claim["outcome"]["value"]["bearerToken"].as_str().unwrap();
    let created = rpc(
        &app,
        json!({"_tag":"session.create","payload":{"name":"Modes"}}),
        Some(token),
    )
    .await;
    let id = created["outcome"]["value"]["id"].as_str().unwrap();
    command(
        &app,
        token,
        id,
        json!({"_tag":"queue.add","payload":{"trackIds":["a","b","a","c","d"]}}),
    )
    .await;
    command(
        &app,
        token,
        id,
        json!({"_tag":"cursor.jump","payload":{"index":2}}),
    )
    .await;
    command(
        &app,
        token,
        id,
        json!({"_tag":"transport.play","payload":{}}),
    )
    .await;
    command(
        &app,
        token,
        id,
        json!({"_tag":"position.report","payload":{"positionMs":42000,"durationMs":180000}}),
    )
    .await;
    let shuffled = command(
        &app,
        token,
        id,
        json!({"_tag":"shuffle.set","payload":{"enabled":true}}),
    )
    .await;
    assert_eq!(shuffled["currentTrackId"], "a");
    assert_eq!(
        shuffled["queueOrder"][shuffled["cursor"].as_u64().unwrap() as usize],
        2
    );
    assert_eq!(shuffled["positionMs"], 42000);
    command(
        &app,
        token,
        id,
        json!({"_tag":"queue.remove","payload":{"index":0}}),
    )
    .await;
    command(
        &app,
        token,
        id,
        json!({"_tag":"queue.add","payload":{"trackIds":["a","e"]}}),
    )
    .await;
    let restored = command(
        &app,
        token,
        id,
        json!({"_tag":"shuffle.set","payload":{"enabled":false}}),
    )
    .await;
    assert_eq!(restored["queue"], json!(["b", "a", "c", "d", "a", "e"]));
    assert_eq!(restored["cursor"], 1);
    assert_eq!(restored["positionMs"], 42000);
    command(
        &app,
        token,
        id,
        json!({"_tag":"repeat.set","payload":{"mode":"one"}}),
    )
    .await;
    drop(app);
    drop(store);
    let app = router(AppState::open(Store::open(dir.path()).unwrap()).unwrap());
    let reopened = rpc(
        &app,
        json!({"_tag":"session.state.get","payload":{"sessionId":id}}),
        Some(token),
    )
    .await;
    assert_eq!(reopened["outcome"]["value"]["repeat"], "one");
    assert_eq!(reopened["outcome"]["value"]["queue"], restored["queue"]);
    assert_eq!(reopened["outcome"]["value"]["cursor"], 1);
}

#[tokio::test]
async fn repeat_one_replays_natural_end_but_explicit_cursor_skip_is_not_trapped() {
    let dir = tempfile::tempdir().unwrap();
    let app = router(AppState::open(Store::open(dir.path()).unwrap()).unwrap());
    let claim = rpc(
        &app,
        json!({"_tag":"auth.device.claim","payload":{"name":"Modes"}}),
        None,
    )
    .await;
    let token = claim["outcome"]["value"]["bearerToken"].as_str().unwrap();
    let created = rpc(
        &app,
        json!({"_tag":"session.create","payload":{"name":"Modes"}}),
        Some(token),
    )
    .await;
    let id = created["outcome"]["value"]["id"].as_str().unwrap();
    command(
        &app,
        token,
        id,
        json!({"_tag":"queue.add","payload":{"trackIds":["a","b"]}}),
    )
    .await;
    command(
        &app,
        token,
        id,
        json!({"_tag":"repeat.set","payload":{"mode":"one"}}),
    )
    .await;
    command(
        &app,
        token,
        id,
        json!({"_tag":"transport.play","payload":{}}),
    )
    .await;
    let repeated = command(
        &app,
        token,
        id,
        json!({"_tag":"transport.trackEnded","payload":{}}),
    )
    .await;
    assert_eq!(repeated["cursor"], 0);
    assert_eq!(repeated["transport"], "playing");
    command(
        &app,
        token,
        id,
        json!({"_tag":"cursor.jump","payload":{"index":1}}),
    )
    .await;
    command(
        &app,
        token,
        id,
        json!({"_tag":"repeat.set","payload":{"mode":"all"}}),
    )
    .await;
    command(
        &app,
        token,
        id,
        json!({"_tag":"transport.play","payload":{}}),
    )
    .await;
    let wrapped = command(
        &app,
        token,
        id,
        json!({"_tag":"transport.trackEnded","payload":{}}),
    )
    .await;
    assert_eq!(wrapped["cursor"], 0);
    assert_eq!(wrapped["transport"], "playing");
    command(
        &app,
        token,
        id,
        json!({"_tag":"repeat.set","payload":{"mode":"off"}}),
    )
    .await;
    command(
        &app,
        token,
        id,
        json!({"_tag":"cursor.jump","payload":{"index":1}}),
    )
    .await;
    command(
        &app,
        token,
        id,
        json!({"_tag":"transport.play","payload":{}}),
    )
    .await;
    let ended = command(
        &app,
        token,
        id,
        json!({"_tag":"transport.trackEnded","payload":{}}),
    )
    .await;
    assert_eq!(ended["transport"], "ended");
}

#[tokio::test]
async fn current_v2_persisted_sessions_default_modes_without_losing_queue_or_cursor() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(dir.path()).unwrap();
    let app = router(AppState::open(store.clone()).unwrap());
    let claim = rpc(
        &app,
        json!({"_tag":"auth.device.claim","payload":{"name":"Existing"}}),
        None,
    )
    .await;
    let token = claim["outcome"]["value"]["bearerToken"].as_str().unwrap();
    let device = claim["outcome"]["value"]["device"]["id"].as_str().unwrap();
    store.put(schema::SESSIONS, &AccountId::new("default"), "current-v2", &json!({"id":"current-v2","accountId":"default","name":"Existing","hostDeviceId":device,"queue":["a","a","b"],"cursor":1,"transport":"paused","positionMs":42000,"durationMs":180000,"volume":50,"revision":7,"updatedBy":device,"updatedAt":"now"})).unwrap();
    drop(app);
    drop(store);
    let app = router(AppState::open(Store::open(dir.path()).unwrap()).unwrap());
    let restored = rpc(
        &app,
        json!({"_tag":"session.state.get","payload":{"sessionId":"current-v2"}}),
        Some(token),
    )
    .await;
    let value = &restored["outcome"]["value"];
    assert_eq!(value["repeat"], "off");
    assert_eq!(value["shuffle"], false);
    assert_eq!(value["queue"], json!(["a", "a", "b"]));
    assert_eq!(value["cursor"], 1);
    assert_eq!(value["positionMs"], 42000);
}

#[tokio::test]
async fn stale_http_clients_fail_retryably_before_old_shuffle_intent_is_decoded() {
    let dir = tempfile::tempdir().unwrap();
    let app = router(AppState::open(Store::open(dir.path()).unwrap()).unwrap());
    for version in [None, Some("pyxis-rpc-v2")] {
        let mut request = Request::builder().method("POST").uri("/rpc");
        if let Some(version) = version {
            request = request.header("x-pyxis-contract", version);
        }
        let response = app.clone().oneshot(request.body(Body::from(json!({"_tag":"session.command.run","payload":{"sessionId":"saved","commandId":"old","command":{"_tag":"queue.shuffle","payload":{}}}}).to_string())).unwrap()).await.unwrap();
        let response: Value =
            serde_json::from_slice(&to_bytes(response.into_body(), 1024 * 1024).await.unwrap())
                .unwrap();
        assert_eq!(response["outcome"]["value"]["code"], "contract.mismatch");
        assert_eq!(response["outcome"]["value"]["retryable"], true);
    }
}

#[tokio::test]
async fn shuffled_order_and_modes_persist_and_handoff_with_the_current_occurrence() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(dir.path()).unwrap();
    let state = AppState::open(store.clone()).unwrap();
    let app = router(state.clone());
    let first = rpc(
        &app,
        json!({"_tag":"auth.device.claim","payload":{"name":"Source"}}),
        None,
    )
    .await;
    let second = rpc(
        &app,
        json!({"_tag":"auth.device.claim","payload":{"name":"Target"}}),
        None,
    )
    .await;
    let token = first["outcome"]["value"]["bearerToken"].as_str().unwrap();
    let target_token = second["outcome"]["value"]["bearerToken"].as_str().unwrap();
    let source = rpc(
        &app,
        json!({"_tag":"session.create","payload":{"name":"Source"}}),
        Some(token),
    )
    .await;
    let target = rpc(
        &app,
        json!({"_tag":"session.create","payload":{"name":"Target"}}),
        Some(target_token),
    )
    .await;
    let id = source["outcome"]["value"]["id"].as_str().unwrap();
    let target_id = target["outcome"]["value"]["id"].as_str().unwrap();
    command(
        &app,
        token,
        id,
        json!({"_tag":"queue.add","payload":{"trackIds":["a","b","a","c","d"]}}),
    )
    .await;
    command(
        &app,
        token,
        id,
        json!({"_tag":"cursor.jump","payload":{"index":2}}),
    )
    .await;
    command(
        &app,
        token,
        id,
        json!({"_tag":"repeat.set","payload":{"mode":"all"}}),
    )
    .await;
    let shuffled = command(
        &app,
        token,
        id,
        json!({"_tag":"shuffle.set","payload":{"enabled":true}}),
    )
    .await;
    drop(app);
    drop(state);
    drop(store);
    let state = AppState::open(Store::open(dir.path()).unwrap()).unwrap();
    state
        .sessions
        .attach_device(first["outcome"]["value"]["device"]["id"].as_str().unwrap());
    state
        .sessions
        .attach_device(second["outcome"]["value"]["device"]["id"].as_str().unwrap());
    let app = router(state);
    let carried = rpc(
        &app,
        json!({"_tag":"session.handoff","payload":{"sessionId":id,"targetSessionId":target_id}}),
        Some(token),
    )
    .await;
    assert_eq!(carried["outcome"]["status"], "ready");
    assert_eq!(carried["outcome"]["value"]["repeat"], "all");
    assert_eq!(carried["outcome"]["value"]["shuffle"], true);
    assert_eq!(
        carried["outcome"]["value"]["queueOrder"],
        shuffled["queueOrder"]
    );
    let restored = command(
        &app,
        target_token,
        target_id,
        json!({"_tag":"shuffle.set","payload":{"enabled":false}}),
    )
    .await;
    assert_eq!(restored["queue"], json!(["a", "b", "a", "c", "d"]));
    assert_eq!(restored["cursor"], 2);
}

#[tokio::test]
async fn play_next_inserts_after_the_current_occurrence_and_seek_uses_the_reported_duration() {
    let dir = tempfile::tempdir().unwrap();
    let app = router(AppState::open(Store::open(dir.path()).unwrap()).unwrap());
    let claim = rpc(
        &app,
        json!({"_tag":"auth.device.claim","payload":{"name":"Insert"}}),
        None,
    )
    .await;
    let token = claim["outcome"]["value"]["bearerToken"].as_str().unwrap();
    let created = rpc(
        &app,
        json!({"_tag":"session.create","payload":{"name":"Insert"}}),
        Some(token),
    )
    .await;
    let id = created["outcome"]["value"]["id"].as_str().unwrap();
    for step in [
        json!({"_tag":"queue.add","payload":{"trackIds":["a","b","c","d"]}}),
        json!({"_tag":"cursor.jump","payload":{"index":1}}),
        json!({"_tag":"transport.play","payload":{}}),
        json!({"_tag":"shuffle.set","payload":{"enabled":true}}),
    ] {
        command(&app, token, id, step).await;
    }
    let inserted = command(
        &app,
        token,
        id,
        json!({"_tag":"queue.add","payload":{"trackIds":["x","y"],"index":2}}),
    )
    .await;
    assert_eq!(inserted["cursor"], 1);
    assert_eq!(inserted["currentTrackId"], "b");
    assert_eq!(
        inserted["transport"], "playing",
        "insert does not stop playback"
    );
    assert_eq!(inserted["queue"][2], "x");
    assert_eq!(inserted["queue"][3], "y");
    assert_eq!(
        inserted["queueOrder"][1], 1,
        "the current occurrence keeps its ordinal"
    );
    let restored = command(
        &app,
        token,
        id,
        json!({"_tag":"shuffle.set","payload":{"enabled":false}}),
    )
    .await;
    assert_eq!(restored["queue"], json!(["a", "b", "x", "y", "c", "d"]));
    let outside = rpc(
        &app,
        json!({"_tag":"session.command.run","payload":{"sessionId":id,
            "command":{"_tag":"queue.add","payload":{"trackIds":["z"],"index":9}}}}),
        Some(token),
    )
    .await;
    assert_eq!(outside["outcome"]["status"], "rejected", "{outside}");

    // "b" is a station/search-style track with no library record: the host-reported
    // duration is what bounds the seek.
    let refused = rpc(
        &app,
        json!({"_tag":"session.command.run","payload":{"sessionId":id,
            "command":{"_tag":"transport.seek","payload":{"positionMs":5000}}}}),
        Some(token),
    )
    .await;
    assert_eq!(
        refused["outcome"]["status"], "rejected",
        "no duration yet: {refused}"
    );
    command(
        &app,
        token,
        id,
        json!({"_tag":"position.report","payload":{"positionMs":1000,"durationMs":180000}}),
    )
    .await;
    let sought = command(
        &app,
        token,
        id,
        json!({"_tag":"transport.seek","payload":{"positionMs":5000}}),
    )
    .await;
    assert_eq!(sought["positionMs"], 5000);
    let beyond = rpc(
        &app,
        json!({"_tag":"session.command.run","payload":{"sessionId":id,
            "command":{"_tag":"transport.seek","payload":{"positionMs":190000}}}}),
        Some(token),
    )
    .await;
    assert_eq!(beyond["outcome"]["status"], "rejected", "{beyond}");
}
