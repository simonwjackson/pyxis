use super::*;

fn draft(name: &str, tag: &str) -> Value {
    json!({"name":name,"tagExpression":{"op":"tag","value":tag},"sort":"title"})
}

#[tokio::test]
async fn shelf_writes_compare_revisions_and_survive_reopen() {
    let dir = tempfile::tempdir().unwrap();
    let app = router(AppState::open(Store::open(dir.path()).unwrap()).unwrap());
    let bearer = token(&app).await;
    let saved = library_call(&app, &bearer, "library.shelf.save", draft("Shows", "live")).await;
    assert_eq!(saved["status"], "ready");
    let shelf = &saved["value"];
    assert_eq!(shelf["revision"], 1);
    let id = &shelf["id"];
    let mut replace = draft("Favorites", "star");
    replace["shelfId"] = id.clone();
    replace["expectedRevision"] = json!(1);
    let (first, second) = tokio::join!(
        library_call(&app, &bearer, "library.shelf.save", replace.clone()),
        library_call(&app, &bearer, "library.shelf.save", replace.clone())
    );
    let (saved, stale) = if first["status"] == "ready" {
        (first, second)
    } else {
        (second, first)
    };
    assert_eq!(stale["status"], "conflict");
    assert_eq!(
        saved["value"],
        json!({"id":id,"revision":2,"name":"Favorites","tagExpression":replace["tagExpression"],"sort":"title"})
    );
    drop(app);
    let app = router(AppState::open(Store::open(dir.path()).unwrap()).unwrap());
    assert_eq!(
        library_call(&app, &bearer, "library.shelves.list", json!({})).await["value"],
        json!([saved["value"]])
    );
    let other = library_call(
        &app,
        &bearer,
        "account.create",
        json!({"name":"Other","deviceName":"Other"}),
    )
    .await;
    let other = other["value"]["bearerToken"].as_str().unwrap();
    assert_eq!(
        library_call(&app, other, "library.shelves.list", json!({})).await["value"],
        json!([])
    );
    for (op, payload) in [
        ("library.shelf.save", replace),
        (
            "library.shelf.remove",
            json!({"shelfId":id,"expectedRevision":2}),
        ),
        ("library.shelf.albums.list", json!({"shelfId":id})),
    ] {
        assert_eq!(
            library_call(&app, other, op, payload).await["status"],
            "unknown"
        );
    }
    for (revision, status) in [(1, "conflict"), (2, "removed"), (2, "unknown")] {
        assert_eq!(
            library_call(
                &app,
                &bearer,
                "library.shelf.remove",
                json!({"shelfId":id,"expectedRevision":revision})
            )
            .await["status"],
            status
        );
    }
    assert_eq!(
        library_call(&app, &bearer, "library.shelves.list", json!({})).await["value"],
        json!([])
    );
}

#[tokio::test]
async fn shelves_validate_before_save_and_read_fresh_membership_on_first_page_only() {
    let dir = tempfile::tempdir().unwrap();
    let app = router(AppState::open(Store::open(dir.path()).unwrap()).unwrap());
    let bearer = token(&app).await;
    for expr in [
        json!({"op":"not","value":[]}),
        json!({"op":"and","value":[]}),
    ] {
        let mut invalid = draft("Invalid", "ok");
        invalid["tagExpression"] = expr;
        assert_eq!(
            library_call(&app, &bearer, "library.shelf.save", invalid).await["status"],
            "invalid"
        );
    }
    assert_eq!(
        library_call(&app, &bearer, "library.shelves.list", json!({})).await["value"],
        json!([])
    );
    let shelf = library_call(
        &app,
        &bearer,
        "library.shelf.save",
        draft("Shows", " LIVE "),
    )
    .await;
    let id = &shelf["value"]["id"];
    assert_eq!(shelf["value"]["tagExpression"]["value"], "live");
    let second = library_call(
        &app,
        &bearer,
        "library.shelf.save",
        draft("Also shows", "live"),
    )
    .await;
    let a = add_tagged(&app, &bearer, "A", "x", json!(["live"])).await;
    let b = add_tagged(&app, &bearer, "B", "y", json!(["live"])).await;
    add_tagged(&app, &bearer, "C", "z", json!([])).await;
    let page = library_call(
        &app,
        &bearer,
        "library.shelf.albums.list",
        json!({"shelfId":id,"limit":1}),
    )
    .await;
    assert_eq!(page["value"]["albums"], json!([a]));
    let cursor = &page["value"]["cursor"];
    assert!(cursor.is_string());
    assert_eq!(
        library_call(
            &app,
            &bearer,
            "library.shelf.albums.list",
            json!({"shelfId":second["value"]["id"],"cursor":cursor})
        )
        .await["status"],
        "invalid"
    );
    assert_eq!(
        library_call(
            &app,
            &bearer,
            "library.albums.query",
            json!({"cursor":cursor})
        )
        .await["status"],
        "invalid"
    );
    let edit = library_call(
        &app,
        &bearer,
        "library.album.command.run",
        json!({"albumId":b["id"],"command":{"_tag":"tags.set","payload":{"tags":[]}}}),
    )
    .await;
    assert_eq!(edit["status"], "applied");
    assert_eq!(
        library_call(
            &app,
            &bearer,
            "library.shelf.albums.list",
            json!({"shelfId":id,"cursor":cursor})
        )
        .await["value"],
        json!({"albums":[b]})
    );
    assert_eq!(
        library_call(
            &app,
            &bearer,
            "library.shelf.albums.list",
            json!({"shelfId":id})
        )
        .await["value"],
        json!({"albums":[a]})
    );
}
