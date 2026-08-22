use pyxis::db::schema;
use pyxis::db::store::{AccountId, Store};
use pyxis::library::{AlbumInput, Library, Placement, PlaylistInput, SourceReference, TrackInput};
use serde::Serialize;

fn album() -> AlbumInput {
    AlbumInput {
        title: "Heroes".into(),
        artist: "David Bowie".into(),
        year: Some(1977),
        source_reference: Some(SourceReference {
            plugin_id: "ytmusic".into(),
            external_id: "album-heroes".into(),
        }),
        tracks: vec![TrackInput {
            id: Some("track-heroes".into()),
            title: "Heroes".into(),
            artist: "David Bowie".into(),
            duration_ms: Some(372_000),
            track_number: Some(3),
        }],
    }
}

#[test]
fn explicit_add_enters_discovery_and_duplicate_source_ref_returns_the_same_album() {
    let dir = tempfile::tempdir().expect("temp dir");
    let store = Store::open(dir.path()).expect("store");
    let library = Library::open(store);
    let account = AccountId::new("account-a");

    let first = library
        .add_album(&account, album(), "device-a")
        .expect("first add");
    let second = library
        .add_album(&account, album(), "device-a")
        .expect("second add");

    assert_eq!(first.placement, Placement::Discovery);
    assert_eq!(first.id, second.id);
    assert_eq!(library.list_albums(&account).unwrap().len(), 1);
    assert_eq!(first.tracks[0].id, "track-heroes");
}

#[test]
fn placement_transition_persists_and_bumps_revision() {
    let dir = tempfile::tempdir().expect("temp dir");
    let account = AccountId::new("account-a");
    let album_id = {
        let store = Store::open(dir.path()).expect("store");
        let library = Library::open(store.clone());
        let album = library
            .add_album(&account, album(), "device-a")
            .expect("add");
        let moved = library
            .set_placement(&account, &album.id, Placement::Collection, "device-a")
            .expect("move")
            .expect("album");
        assert_eq!(moved.revision, album.revision + 1);
        store.close().expect("close");
        album.id
    };

    let reopened = Library::open(Store::open(dir.path()).expect("reopen"));
    let album = reopened
        .get_album(&account, &album_id)
        .expect("get")
        .expect("album");

    assert_eq!(album.placement, Placement::Collection);
    assert_eq!(album.revision, 2);
}

#[test]
fn yaml_store_round_trips_indicator_hazard_titles() {
    let dir = tempfile::tempdir().expect("temp dir");
    let account = AccountId::new("account-a");
    let album_id = {
        let store = Store::open(dir.path()).expect("store");
        let library = Library::open(store.clone());
        let mut input = album();
        let prototype = input.tracks[0].clone();
        input.tracks = ["Note to Self:", "-", "?"]
            .into_iter()
            .enumerate()
            .map(|(index, title)| TrackInput {
                id: Some(format!("hazard-track-{index}")),
                title: title.into(),
                ..prototype.clone()
            })
            .collect();
        let added = library.add_album(&account, input, "device-a").expect("add");
        store.close().expect("close");
        added.id
    };

    let reopened = Library::open(Store::open(dir.path()).expect("reopen"));
    let album = reopened
        .get_album(&account, &album_id)
        .expect("get")
        .expect("album");

    assert_eq!(
        album
            .tracks
            .into_iter()
            .map(|track| track.title)
            .collect::<Vec<_>>(),
        ["Note to Self:", "-", "?"]
    );
}

#[test]
fn readding_a_dismissed_album_returns_it_to_discovery() {
    let dir = tempfile::tempdir().expect("temp dir");
    let store = Store::open(dir.path()).expect("store");
    let library = Library::open(store);
    let account = AccountId::new("account-a");
    let added = library
        .add_album(&account, album(), "device-a")
        .expect("add");
    library
        .set_placement(&account, &added.id, Placement::Dismissed, "device-a")
        .expect("dismiss");

    let readded = library
        .add_album(&account, album(), "device-a")
        .expect("readd");

    assert_eq!(readded.id, added.id);
    assert_eq!(readded.placement, Placement::Discovery);
    assert_eq!(readded.revision, 3);
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ListenEventRecord {
    id: String,
    account_id: String,
    kind: String,
    happened_at: String,
    device_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    track_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    album_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    source_plugin_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    played_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    completed: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    context: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    context_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    from_placement: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    to_placement: Option<String>,
    revision: u64,
    updated_by: String,
    updated_at: String,
}

#[test]
fn readding_a_removed_album_refreshes_existing_track_metadata() {
    let dir = tempfile::tempdir().expect("temp dir");
    let store = Store::open(dir.path()).expect("store");
    let library = Library::open(store);
    let account = AccountId::new("account-a");
    let mut original = album();
    original.tracks[0].artist = "Unknown".into();
    let added = library
        .add_album(&account, original, "device-a")
        .expect("add");
    assert!(library.remove_album(&account, &added.id).expect("remove"));

    let corrected = library
        .add_album(&account, album(), "device-a")
        .expect("readd");

    assert_eq!(corrected.tracks[0].artist, "David Bowie");
    assert_eq!(corrected.tracks[0].revision, 2);
}

#[test]
fn failed_cross_account_track_collision_rolls_back_the_whole_album() {
    let dir = tempfile::tempdir().expect("temp dir");
    let store = Store::open(dir.path()).expect("store");
    let library = Library::open(store);
    let first = AccountId::new("account-a");
    let second = AccountId::new("account-b");
    library
        .add_album(&first, album(), "device-a")
        .expect("first album");

    library
        .add_album(&second, album(), "device-b")
        .expect_err("cross-account track id must fail");

    assert!(library
        .list_albums(&second)
        .expect("second library")
        .is_empty());
    assert_eq!(library.list_albums(&first).expect("first library").len(), 1);
}

#[test]
fn shared_track_identity_keeps_intrinsic_metadata_and_album_specific_numbers() {
    let dir = tempfile::tempdir().expect("temp dir");
    let store = Store::open(dir.path()).expect("store");
    let library = Library::open(store);
    let account = AccountId::new("account-a");
    let first = library
        .add_album(&account, album(), "device-a")
        .expect("first album");
    let mut second_input = album();
    second_input.title = "Bowie Collection".into();
    second_input.source_reference = Some(SourceReference {
        plugin_id: "ytmusic".into(),
        external_id: "bowie-collection".into(),
    });
    second_input.tracks[0].title = "Not Heroes".into();
    second_input.tracks[0].artist = "Not David Bowie".into();
    second_input.tracks[0].track_number = Some(7);
    let second = library
        .add_album(&account, second_input, "device-a")
        .expect("second album");

    assert_eq!(first.tracks[0].title, "Heroes");
    let first = library
        .get_album(&account, &first.id)
        .expect("get first")
        .expect("first");
    assert_eq!(first.tracks[0].title, "Heroes");
    assert_eq!(first.tracks[0].artist, "David Bowie");
    assert_eq!(first.tracks[0].track_number, Some(3));
    assert_eq!(second.tracks[0].title, "Heroes");
    assert_eq!(second.tracks[0].artist, "David Bowie");
    assert_eq!(second.tracks[0].track_number, Some(7));
}

#[test]
fn removing_an_album_deletes_library_rows_but_not_listen_events() {
    let dir = tempfile::tempdir().expect("temp dir");
    let store = Store::open(dir.path()).expect("store");
    let library = Library::open(store.clone());
    let account = AccountId::new("account-a");
    let added = library
        .add_album(&account, album(), "device-a")
        .expect("add");
    store
        .put(
            schema::LISTEN_EVENTS,
            &account,
            "listen-1",
            &ListenEventRecord {
                id: String::new(),
                account_id: String::new(),
                kind: "trackPlayed".into(),
                happened_at: "2026-08-21T00:00:00Z".into(),
                device_id: "device-a".into(),
                track_id: Some("track-heroes".into()),
                album_id: Some(added.id.clone()),
                source_plugin_id: None,
                played_ms: Some(60_000),
                completed: Some(false),
                context: Some("album".into()),
                context_id: Some(added.id.clone()),
                from_placement: None,
                to_placement: None,
                revision: 1,
                updated_by: "device-a".into(),
                updated_at: "2026-08-21T00:00:00Z".into(),
            },
        )
        .expect("listen");

    assert!(library.remove_album(&account, &added.id).expect("remove"));

    assert!(library.get_album(&account, &added.id).unwrap().is_none());
    let listens: Vec<serde_json::Value> = store.list(schema::LISTEN_EVENTS, &account).unwrap();
    assert_eq!(listens.len(), 1);
    assert_eq!(listens[0]["trackId"], "track-heroes");
}

#[test]
fn bookmarks_and_playlists_are_account_scoped_library_records() {
    let dir = tempfile::tempdir().expect("temp dir");
    let store = Store::open(dir.path()).expect("store");
    let library = Library::open(store);
    let first = AccountId::new("account-a");
    let second = AccountId::new("account-b");

    library
        .add_bookmark(&first, "track-heroes", "device-a")
        .expect("bookmark");
    let playlist = library
        .create_playlist(
            &first,
            PlaylistInput {
                title: "Bowie".into(),
                track_ids: vec!["track-heroes".into()],
            },
            "device-a",
        )
        .expect("playlist");

    assert_eq!(library.list_bookmarks(&first).unwrap().len(), 1);
    assert!(library.list_bookmarks(&second).unwrap().is_empty());
    assert_eq!(library.list_playlists(&first).unwrap()[0].id, playlist.id);
    assert!(library.list_playlists(&second).unwrap().is_empty());
}
