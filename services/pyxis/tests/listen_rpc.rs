mod v4_schema;
use axum::body::{to_bytes, Body};
use axum::http::{header, Request, StatusCode};
use pyxis::api::{router, AppState};
use pyxis::db::store::Store;
use serde_json::{json, Value};
use tower::ServiceExt;
use v4_schema::check_v4_schema;

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

#[tokio::test]
async fn batch_append_replay_and_history_are_public_contracts() {
    let dir = tempfile::tempdir().expect("temp dir");
    let app = router(AppState::open(Store::open(dir.path()).expect("store")).expect("state"));
    let claim = rpc(
        &app,
        json!({
            "_tag": "auth.device.claim",
            "payload": { "name": "listen test" }
        }),
        None,
    )
    .await;
    let token = claim["outcome"]["value"]["bearerToken"]
        .as_str()
        .expect("token");
    let device_id = claim["outcome"]["value"]["device"]["id"]
        .as_str()
        .expect("device id");
    let listened_at = [
        "2026-08-20T10:00:00Z",
        "2026-08-20T11:00:00Z",
        "2026-08-20T12:00:00Z",
    ];
    let events = json!([
        {
            "id": "01M0K00000000000000000000C",
            "trackId": "track-1",
            "albumId": "album-1",
            "deviceId": device_id,
            "sourcePluginId": "ytmusic",
            "listenedAt": listened_at[0],
            "playedMs": 180000,
            "completed": true,
            "context": "album",
            "contextId": "album-1"
        },
        {
            "id": "01M0K00000000000000000000D",
            "trackId": "track-1",
            "albumId": "album-1",
            "deviceId": device_id,
            "sourcePluginId": "ytmusic",
            "listenedAt": listened_at[1],
            "playedMs": 180000,
            "completed": true,
            "context": "album",
            "contextId": "album-1"
        },
        {
            "id": "01M0K00000000000000000000E",
            "trackId": "track-1",
            "albumId": "album-1",
            "deviceId": device_id,
            "sourcePluginId": "ytmusic",
            "listenedAt": listened_at[2],
            "playedMs": 180000,
            "completed": true,
            "context": "album",
            "contextId": "album-1"
        }
    ]);

    let first = rpc(
        &app,
        json!({
            "_tag": "listen.events.append",
            "payload": { "events": events }
        }),
        Some(token),
    )
    .await;
    let replay = rpc(
        &app,
        json!({
            "_tag": "listen.events.append",
            "payload": { "events": events }
        }),
        Some(token),
    )
    .await;
    assert_eq!(first["outcome"]["value"]["accepted"], 3);
    assert_eq!(replay["outcome"]["value"]["duplicates"], 3);

    let history = rpc(
        &app,
        json!({
            "_tag": "listen.history.list",
            "payload": { "limit": 10 }
        }),
        Some(token),
    )
    .await;
    assert_eq!(history["outcome"]["value"].as_array().unwrap().len(), 3);
    assert_eq!(history["outcome"]["value"][0]["listenedAt"], listened_at[2]);
    check_v4_schema("RpcResponse", &history);
    let page = |payload| {
        rpc(
            &app,
            json!({"_tag":"listen.journal.list", "payload":payload}),
            Some(token),
        )
    };
    let range = json!({"from":listened_at[0], "to":listened_at[2], "limit":1});
    let first = page(range.clone()).await;
    let row = &first["outcome"]["value"]["events"][0]["event"];
    assert_eq!(row["listenedAt"], listened_at[1]);
    let mut newer = events[0].clone();
    newer["id"] = json!("01M0K00000000000000000000G");
    newer["listenedAt"] = json!("2026-08-20T11:30:00Z");
    let appended = rpc(
        &app,
        json!({"_tag":"listen.events.append","payload":{"events":[newer]}}),
        Some(token),
    )
    .await;
    assert_eq!(appended["outcome"]["value"]["accepted"], 1);
    let mut next = range;
    next["cursor"] = first["outcome"]["value"]["nextCursor"].clone();
    let last = page(next).await;
    assert_eq!(
        last["outcome"]["value"]["events"][0]["event"]["listenedAt"],
        listened_at[0]
    );
    assert!(last["outcome"]["value"]["nextCursor"].is_null());
    assert_eq!(
        page(json!({"from":listened_at[2],"to":listened_at[2]})).await["outcome"]["value"]
            ["events"],
        json!([])
    );
    assert_eq!(
        page(json!({"cursor":"unknown"})).await["outcome"]["status"],
        "invalid"
    );
}

#[tokio::test]
async fn device_token_cannot_append_an_event_for_a_different_device() {
    let dir = tempfile::tempdir().expect("temp dir");
    let app = router(AppState::open(Store::open(dir.path()).expect("store")).expect("state"));
    let claim = rpc(
        &app,
        json!({
            "_tag": "auth.device.claim",
            "payload": { "name": "listen test" }
        }),
        None,
    )
    .await;
    let token = claim["outcome"]["value"]["bearerToken"]
        .as_str()
        .expect("token");

    let result = rpc(
        &app,
        json!({
            "_tag": "listen.events.append",
            "payload": {
                "events": [{
                    "id": "01M0K00000000000000000000F",
                    "trackId": "track-1",
                    "deviceId": "someone-else",
                    "listenedAt": "2026-08-21T11:00:00Z",
                    "completed": false,
                    "context": "queue"
                }]
            }
        }),
        Some(token),
    )
    .await;

    assert_eq!(result["outcome"]["status"], "invalid");
    assert_eq!(result["outcome"]["value"]["code"], "listen.deviceMismatch");
}

#[tokio::test]
async fn journal_replay_preserves_open_sessions_and_capture_context() {
    let dir = tempfile::tempdir().unwrap();
    let app = router(AppState::open(Store::open(dir.path()).unwrap()).unwrap());
    let claim = rpc(
        &app,
        json!({"_tag":"auth.device.claim","payload":{"name":"journal"}}),
        None,
    )
    .await;
    let device = &claim["outcome"]["value"]["device"]["id"];
    let token = claim["outcome"]["value"]["bearerToken"].as_str();
    let station = json!({"kind":"stationSession","event":{"id":"01M0K000000000000000000001","deviceId":device,"stationId":"radio","sourcePluginId":"catalog","sessionId":"desk","startedAt":"2026-02-02T12:00:00Z"}});
    let capture = json!({"kind":"capture","event":{"id":"01M0K000000000000000000002","deviceId":device,"albumId":"album","capturedAt":"2026-02-02T12:01:00Z","entryContext":{"origin":"stationTrack","trackId":"track"}}});
    let append = |events| {
        rpc(
            &app,
            json!({"_tag":"listen.events.append","payload":{"events":events}}),
            token,
        )
    };
    assert_eq!(
        append(json!([station, capture])).await["outcome"]["value"]["accepted"],
        2
    );
    assert_eq!(
        append(json!([station, capture])).await["outcome"]["value"]["duplicates"],
        2
    );
    let mut changed = station.clone();
    changed["event"]["endedAt"] = json!("2026-02-02T12:02:00Z");
    assert_eq!(
        append(json!([changed])).await["outcome"]["status"],
        "conflict"
    );
    let history = rpc(
        &app,
        json!({"_tag":"listen.journal.list","payload":{"from":"2026-02-02T12:00:00Z"}}),
        token,
    )
    .await;
    let rows = history["outcome"]["value"]["events"].as_array().unwrap();
    assert_eq!(
        rows[0]["event"]["entryContext"],
        capture["event"]["entryContext"]
    );
    assert_eq!(rows[1]["kind"], "stationSession");
    assert_eq!(rows[1]["event"]["sessionId"], "desk");
    assert!(rows[1]["event"].get("endedAt").is_none());
    let captures = rpc(
        &app,
        json!({"_tag":"listen.journal.list","payload":{"kinds":["capture"]}}),
        token,
    )
    .await;
    assert_eq!(captures["outcome"]["value"]["events"], json!([capture]));
    let old = rpc(
        &app,
        json!({"_tag":"listen.history.list","payload":{}}),
        token,
    )
    .await;
    check_v4_schema("RpcResponse", &old);
    assert_eq!(old["outcome"]["value"], json!([]));
}

#[test]
fn journal_filter_discriminants_match_every_event_tag() {
    use pyxis::rpc::contract::{JournalEvent, JournalKind};
    // Walk the actual generated event schema so adding an event extends this check.
    let schema = serde_json::to_value(schemars::schema_for!(JournalEvent)).unwrap();
    let event_tags: Vec<_> = schema["oneOf"]
        .as_array()
        .unwrap()
        .iter()
        .map(|case| case["properties"]["kind"]["const"].clone())
        .collect();
    let filters = serde_json::to_value(schemars::schema_for!(JournalKind)).unwrap();
    assert_eq!(json!(event_tags), filters["enum"]);
    for tag in event_tags {
        let kind: JournalKind = serde_json::from_value(tag.clone()).unwrap();
        assert_eq!(json!(kind), tag);
    }
}
