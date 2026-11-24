use super::*;

async fn query(app: &axum::Router, token: &str, payload: Value) -> Value {
    library_call(app, token, "library.albums.query", payload).await
}

fn titles(outcome: Value) -> Vec<String> {
    assert_eq!(outcome["status"], "ready", "{outcome}");
    outcome["value"]["albums"]
        .as_array()
        .unwrap()
        .iter()
        .map(|album| album["title"].as_str().unwrap().to_owned())
        .collect()
}

#[tokio::test]
async fn query_filters_sorts_and_nests_tag_predicates() {
    let dir = tempfile::tempdir().unwrap();
    let app = router(AppState::open(Store::open(dir.path()).unwrap()).unwrap());
    let grant = rpc(
        &app,
        json!({"_tag":"auth.device.claim","payload":{"name":"browse"}}),
        None,
    )
    .await;
    let grant = &grant["outcome"]["value"];
    let bearer = grant["bearerToken"].as_str().unwrap();
    let a = add_tagged(&app, bearer, "Zulu", "Alpha", json!(["folk", "live"])).await;
    let b = add_tagged(&app, bearer, "Alpha", "Charlie", json!(["rock", "live"])).await;
    add_tagged(
        &app,
        bearer,
        "Bravo",
        "Bravo",
        json!(["rock", "compilation"]),
    )
    .await;
    let device = &grant["device"]["id"];
    let result = library_call(&app,bearer,"listen.events.append",json!({"events":[
        {"id":"01M0K00000000000000000000C","trackId":a["tracks"][0]["id"],"deviceId":device,"listenedAt":"2026-08-21T10:00:00-07:00","completed":true,"context":"queue"},
        {"id":"01M0K00000000000000000000D","trackId":b["tracks"][0]["id"],"albumId":b["id"],"deviceId":device,"listenedAt":"2026-08-21T11:00:00Z","completed":true,"context":"album"}
    ]})).await;
    assert_eq!(result["status"], "ready");
    for (sort, expected) in [
        ("added", ["Bravo", "Alpha", "Zulu"]),
        ("artist", ["Zulu", "Bravo", "Alpha"]),
        ("title", ["Alpha", "Bravo", "Zulu"]),
        ("lastPlayed", ["Zulu", "Alpha", "Bravo"]),
    ] {
        assert_eq!(
            titles(query(&app, bearer, json!({"sort":sort})).await),
            expected
        );
    }
    let tag = |name| json!({"op":"tag","value":name});
    let expr = json!({"op":"and","value":[{"op":"or","value":[tag(" FOLK "),tag("rock")]},{"op":"not","value":tag("compilation")}]});
    assert_eq!(
        titles(
            query(
                &app,
                bearer,
                json!({"text":"ALp","tagExpression":expr,"sort":"title"})
            )
            .await
        ),
        ["Alpha", "Zulu"]
    );
    assert_eq!(
        titles(
            query(
                &app,
                bearer,
                json!({"artist":"CHARLIE","text":"ph","tagExpression":expr})
            )
            .await
        ),
        ["Alpha"]
    );
    assert!(titles(query(&app, bearer, json!({"artist":"arl"})).await).is_empty());
    assert!(titles(query(&app, bearer, json!({"tagExpression":tag("absent")})).await).is_empty());
}

#[tokio::test]
async fn malformed_or_excessive_expressions_are_invalid_even_with_no_albums() {
    let dir = tempfile::tempdir().unwrap();
    let app = router(AppState::open(Store::open(dir.path()).unwrap()).unwrap());
    let bearer = token(&app).await;
    let leaf = json!({"op":"tag","value":"ok"});
    let deep = (0..16).fold(leaf.clone(), |child, _| json!({"op":"not","value":child}));
    for expr in [
        deep,
        json!({"op":"or","value":vec![leaf;256]}),
        json!({"op":"or","value":[]}),
        json!({"op":"any"}),
        json!({"op":"not","value":[]}),
        json!({"op":"tag","value":"  "}),
        json!(null),
    ] {
        assert_eq!(
            query(&app, &bearer, json!({"tagExpression":expr})).await["status"],
            "invalid"
        );
    }
}

#[tokio::test]
async fn continuation_replays_immutable_album_values_and_refuses_foreign_cursors() {
    let dir = tempfile::tempdir().unwrap();
    let app = router(AppState::open(Store::open(dir.path()).unwrap()).unwrap());
    let bearer = token(&app).await;
    add_tagged(&app, &bearer, "A", "One", json!(["keep"])).await;
    let b = add_tagged(&app, &bearer, "B", "Two", json!(["keep"])).await;
    let first = query(
        &app,
        &bearer,
        json!({"sort":"title","tagExpression":{"op":"tag","value":"keep"},"limit":1}),
    )
    .await;
    assert_eq!(titles(first.clone()), ["A"]);
    let cursor = &first["value"]["cursor"];
    assert!(cursor.is_string());
    let other = library_call(
        &app,
        &bearer,
        "account.create",
        json!({"name":"Other","deviceName":"Other"}),
    )
    .await;
    let other = other["value"]["bearerToken"].as_str().unwrap();
    assert_eq!(
        query(&app, other, json!({"cursor":cursor})).await["status"],
        "invalid"
    );
    let edited = library_call(
        &app,
        &bearer,
        "library.album.command.run",
        json!({"albumId":b["id"],"command":{"_tag":"tags.set","payload":{"tags":[]}}}),
    )
    .await;
    assert_eq!(edited["status"], "applied");
    add_tagged(&app, &bearer, "AA", "Three", json!(["keep"])).await;
    let next = query(&app, &bearer, json!({"cursor":cursor})).await;
    assert_eq!(next["value"], json!({"albums":[b]}));
    assert_eq!(query(&app, &bearer, json!({"cursor":cursor})).await, next);
}
