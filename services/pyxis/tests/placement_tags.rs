use proseql_engine::descriptor::{SchemaNode, StructField};
use proseql_native::{NativeCollectionConfig, NativeRuntime, NativeRuntimeConfig};
use pyxis::db::schema;
use pyxis::db::store::{AccountId, Store};
use pyxis::library::Library;
use serde_json::{json, Value};

#[test]
fn opening_old_shape_rows_converts_placements_once_without_losing_tags_or_metadata() {
    let dir = tempfile::tempdir().unwrap();
    let account = AccountId::new("account-a");
    let other = AccountId::new("account-b");
    std::fs::create_dir_all(dir.path().join("db")).unwrap();
    let store = NativeRuntime::open(NativeRuntimeConfig {
        path: Store::path_for(dir.path()).to_string_lossy().into_owned(),
        collections: schema::all()
            .into_iter()
            .map(|mut descriptor| {
                if descriptor.name == schema::ALBUMS {
                    if let SchemaNode::Struct { fields } = &mut descriptor.schema {
                        fields.retain(|field| {
                            field.name != "placement" && field.name != "placementUpdatedAt"
                        });
                        fields.push(StructField {
                            name: "placement".into(),
                            schema: SchemaNode::Str,
                        });
                        fields.push(StructField {
                            name: "placementUpdatedAt".into(),
                            schema: SchemaNode::Str,
                        });
                    }
                }
                NativeCollectionConfig::new(descriptor)
            })
            .collect(),
    })
    .unwrap();
    for (index, placement) in ["discovery", "collection", "archive", "dismissed"]
        .iter()
        .enumerate()
    {
        let id = format!("album-{index}");
        let mut row = json!({
            "title": "Heroes", "artist": "David Bowie", "normalizedTitle": "heroes",
            "normalizedArtist": "david bowie", "placement": placement,
            "placementUpdatedAt": "2026-08-21T00:00:00Z", "addedAt": "2026-08-21T00:00:00Z",
            "year": 1977, "revision": 7, "updatedBy": "device-a", "updatedAt": "2026-08-21T00:00:00Z"
        });
        if index != 0 {
            row["tags"] = json!(["favorite", format!("placement:{placement}")]);
        }
        row["id"] = json!(id);
        row["accountId"] = json!(if index == 3 {
            other.as_str()
        } else {
            account.as_str()
        });
        store
            .mutate(move |db| {
                db.create(schema::ALBUMS, row)?;
                Ok(())
            })
            .unwrap();
    }
    store.close().unwrap();
    let store = Store::open(dir.path()).unwrap();
    for (index, placement) in ["discovery", "collection", "archive", "dismissed"]
        .iter()
        .enumerate()
    {
        let scope = if index == 3 { &other } else { &account };
        let row: Value = store
            .get(schema::ALBUMS, scope, &format!("album-{index}"))
            .unwrap()
            .unwrap();
        assert_eq!(row["revision"], 8);
        assert!(row.get("placement").is_none());
        assert!(row.get("placementUpdatedAt").is_none());
        let expected = if index == 0 {
            json!([format!("placement:{placement}")])
        } else {
            json!(["favorite", format!("placement:{placement}")])
        };
        assert_eq!(row["tags"], expected);
        assert_eq!(row["addedAt"], "2026-08-21T00:00:00Z");
        assert_eq!(row["year"], 1977);
    }
    let library = Library::open(store.clone());
    let album = library.get_album(&account, "album-0").unwrap().unwrap();
    assert_eq!(album.tags, ["placement:discovery"]);
    // Removing the converted tag is a normal edit. A later open must not resurrect it.
    library
        .set_tags(&account, &album.id, vec![], "device-b")
        .unwrap();
    store.close().unwrap();
    let reopened = Store::open(dir.path()).unwrap();
    let row: Value = reopened
        .get(schema::ALBUMS, &account, "album-0")
        .unwrap()
        .unwrap();
    assert_eq!(row["tags"], json!([]));
    assert_eq!(row["revision"], 9);
    let untouched: Value = reopened
        .get(schema::ALBUMS, &other, "album-3")
        .unwrap()
        .unwrap();
    assert_eq!(untouched["revision"], 8);
}

#[test]
fn historic_listen_fields_do_not_prevent_history_or_idempotent_append() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join("db")).unwrap();
    let runtime = NativeRuntime::open(NativeRuntimeConfig {
        path: Store::path_for(dir.path()).to_string_lossy().into_owned(),
        collections: schema::all()
            .into_iter()
            .map(|mut descriptor| {
                if descriptor.name == schema::LISTEN_EVENTS {
                    if let SchemaNode::Struct { fields } = &mut descriptor.schema {
                        for name in ["fromPlacement", "toPlacement"] {
                            fields.push(StructField {
                                name: name.into(),
                                schema: SchemaNode::Optional(Box::new(SchemaNode::Str)),
                            });
                        }
                    }
                }
                NativeCollectionConfig::new(descriptor)
            })
            .collect(),
    })
    .unwrap();
    runtime.mutate(|db| {
        db.create(schema::LISTEN_EVENTS, json!({
            "id": "01M0K000000000000000000001", "accountId": "account-a", "kind": "trackPlayed",
            "happenedAt": "2026-08-21T00:00:00Z", "deviceId": "device-a", "trackId": "track-a",
            "completed": true, "context": "queue", "fromPlacement": "discovery", "toPlacement": "collection",
            "revision": 1, "updatedBy": "device-a", "updatedAt": "2026-08-21T00:00:00Z"
        }))?;
        Ok(())
    }).unwrap();
    runtime.close().unwrap();
    let log = pyxis::listen::ListenLog::open(Store::open(dir.path()).unwrap());
    let account = AccountId::new("account-a");
    assert_eq!(log.history(&account, 10).unwrap()[0].track_id, "track-a");
    let replay = log
        .append_batch(
            &account,
            vec![pyxis::listen::TrackListenInput {
                id: "01M0K000000000000000000001".into(),
                track_id: "track-a".into(),
                device_id: "device-a".into(),
                listened_at: "2026-08-21T00:00:00Z".into(),
                completed: true,
                context: "queue".into(),
                album_id: None,
                source_plugin_id: None,
                played_ms: None,
                context_id: None,
            }],
            "device-a",
        )
        .unwrap();
    assert_eq!(replay.duplicates, 1);
    assert_eq!(replay.accepted, 0);
}

#[test]
fn conversion_keeps_full_tag_sets_and_album_relationships() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(dir.path()).unwrap();
    let account = AccountId::new("account-a");
    let library = Library::open(store.clone());
    let album = library
        .add_album(
            &account,
            pyxis::library::AlbumInput {
                title: "Heroes".into(),
                artist: "David Bowie".into(),
                year: Some(1977),
                artwork_url: Some("https://example.test/art.jpg".into()),
                source_reference: None,
                tracks: vec![pyxis::library::TrackInput {
                    id: Some("track-1".into()),
                    title: "Heroes".into(),
                    artist: "David Bowie".into(),
                    duration_ms: Some(180_000),
                    track_number: Some(1),
                }],
            },
            "device-a",
        )
        .unwrap();
    let tags: Vec<String> = (0..64).map(|index| format!("tag-{index:02}")).collect();
    library
        .set_tags(&account, &album.id, tags.clone(), "device-a")
        .unwrap();
    let mut old: Value = store
        .get(schema::ALBUMS, &account, &album.id)
        .unwrap()
        .unwrap();
    old["placement"] = json!("archive");
    old["placementUpdatedAt"] = json!("2026-08-21T00:00:00Z");
    store
        .put(schema::ALBUMS, &account, &album.id, &old)
        .unwrap();
    store.close().unwrap();
    let store = Store::open(dir.path()).unwrap();
    let converted = Library::open(store)
        .get_album(&account, &album.id)
        .unwrap()
        .unwrap();
    assert_eq!(converted.revision, 3);
    assert_eq!(converted.tags.len(), 65);
    assert!(tags.iter().all(|tag| converted.tags.contains(tag)));
    assert!(converted.tags.contains(&"placement:archive".into()));
    assert_eq!(converted.tracks, album.tracks);
    assert_eq!(converted.artwork_url, album.artwork_url);
    assert_eq!(converted.added_at, album.added_at);
}
