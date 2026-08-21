use std::collections::BTreeSet;
use std::fs;

use pyxis::db::store::{AccountId, Store};
use pyxis::media::{
    Fidelity, LocalCandidateInput, Media, MediaFileStatus, PluginCandidateInput, ResolveOutcome,
    ResolvedLocation,
};

fn setup() -> (tempfile::TempDir, Media, AccountId) {
    let dir = tempfile::tempdir().expect("temp dir");
    let store = Store::open(dir.path()).expect("open store");
    let media = Media::open(store).expect("open media");
    (dir, media, AccountId::new("account-a"))
}

fn live(ids: &[&str]) -> BTreeSet<String> {
    ids.iter().map(|id| (*id).to_string()).collect()
}

fn plugin(
    plugin_id: &str,
    external_id: &str,
    lossless: bool,
    bitrate_kbps: u32,
    sample_rate_hz: u32,
    source_priority: i32,
) -> PluginCandidateInput {
    PluginCandidateInput {
        plugin_id: plugin_id.into(),
        external_id: external_id.into(),
        format: Some("webm/opus".into()),
        fidelity: Fidelity {
            lossless,
            bitrate_kbps: Some(bitrate_kbps),
            sample_rate_hz: Some(sample_rate_hz),
        },
        source_priority,
    }
}

#[test]
fn a_higher_fidelity_candidate_becomes_the_resolution_without_touching_the_track() {
    let (_dir, media, account) = setup();
    let low = media
        .add_plugin_candidate(
            &account,
            "track-1",
            plugin("ytmusic", "low", false, 128, 44_100, 10),
            "device-a",
        )
        .expect("low candidate");
    assert_eq!(
        media
            .resolve(&account, "track-1", &live(&["ytmusic"]))
            .expect("resolve")
            .ready()
            .expect("ready")
            .id,
        low.id
    );

    let high = media
        .add_plugin_candidate(
            &account,
            "track-1",
            plugin("ytmusic", "high", false, 320, 48_000, 10),
            "device-a",
        )
        .expect("high candidate");
    assert_eq!(
        media
            .resolve(&account, "track-1", &live(&["ytmusic"]))
            .expect("resolve")
            .ready()
            .expect("ready")
            .id,
        high.id
    );

    let lossless = media
        .add_plugin_candidate(
            &account,
            "track-1",
            plugin("ytmusic", "lossless", true, 1, 44_100, 0),
            "device-a",
        )
        .expect("lossless candidate");
    assert_eq!(
        media
            .resolve(&account, "track-1", &live(&["ytmusic"]))
            .expect("resolve")
            .ready()
            .expect("ready")
            .id,
        lossless.id
    );
}

#[test]
fn source_priority_breaks_only_an_equal_quality_tie() {
    let (_dir, media, account) = setup();
    media
        .add_plugin_candidate(
            &account,
            "track-1",
            plugin("pandora", "p", false, 192, 44_100, 10),
            "device-a",
        )
        .expect("pandora");
    let preferred = media
        .add_plugin_candidate(
            &account,
            "track-1",
            plugin("ytmusic", "y", false, 192, 44_100, 20),
            "device-a",
        )
        .expect("ytmusic");

    let resolved = media
        .resolve(&account, "track-1", &live(&["pandora", "ytmusic"]))
        .expect("resolve")
        .ready()
        .expect("ready");

    assert_eq!(resolved.id, preferred.id);
}

#[test]
fn a_local_file_wins_over_a_remote_candidate_of_equal_quality() {
    let (dir, media, account) = setup();
    media
        .add_plugin_candidate(
            &account,
            "track-1",
            plugin("ytmusic", "remote", false, 320, 48_000, 100),
            "device-a",
        )
        .expect("remote");
    let source = dir.path().join("track.opus");
    fs::write(&source, b"local audio bytes").expect("source");
    let local = media
        .import_local_candidate(
            &account,
            "track-1",
            &source,
            LocalCandidateInput {
                format: Some("opus".into()),
                fidelity: Fidelity {
                    lossless: false,
                    bitrate_kbps: Some(320),
                    sample_rate_hz: Some(48_000),
                },
                pinned: false,
            },
            "device-a",
        )
        .expect("local");

    let resolved = media
        .resolve(&account, "track-1", &live(&["ytmusic"]))
        .expect("resolve")
        .ready()
        .expect("ready");

    assert_eq!(resolved.id, local.candidate.id);
    assert!(matches!(resolved.location, ResolvedLocation::Local { .. }));
}

#[test]
fn no_available_candidates_is_an_explicit_unavailable_outcome() {
    let (_dir, media, account) = setup();
    media
        .add_plugin_candidate(
            &account,
            "track-1",
            plugin("not-installed", "remote", false, 320, 48_000, 0),
            "device-a",
        )
        .expect("candidate");

    assert_eq!(
        media
            .resolve(&account, "track-1", &BTreeSet::new())
            .expect("resolve"),
        ResolveOutcome::Unavailable
    );
}

#[test]
fn eviction_removes_the_lru_file_but_never_a_pinned_file() {
    let (dir, media, account) = setup();
    let pinned_source = dir.path().join("pinned.flac");
    let old_source = dir.path().join("old.flac");
    let recent_source = dir.path().join("recent.flac");
    fs::write(&pinned_source, b"pinned").expect("pinned source");
    fs::write(&old_source, b"old-old").expect("old source");
    fs::write(&recent_source, b"recent!!").expect("recent source");

    let pinned = media
        .import_local_candidate(
            &account,
            "pinned-track",
            &pinned_source,
            LocalCandidateInput::lossless("flac", true),
            "device-a",
        )
        .expect("pinned");
    let old = media
        .import_local_candidate(
            &account,
            "old-track",
            &old_source,
            LocalCandidateInput::lossless("flac", false),
            "device-a",
        )
        .expect("old");
    let recent = media
        .import_local_candidate(
            &account,
            "recent-track",
            &recent_source,
            LocalCandidateInput::lossless("flac", false),
            "device-a",
        )
        .expect("recent");
    media
        .touch_local(&account, &recent.media_file_id, "device-a")
        .expect("touch recent");

    let budget = pinned.bytes + recent.bytes;
    let evicted = media
        .evict(&account, budget, &BTreeSet::new(), "device-a")
        .expect("evict");

    assert_eq!(
        evicted.removed_media_file_ids,
        vec![old.media_file_id.clone()]
    );
    assert!(media.local_exists(&account, &pinned.media_file_id).unwrap());
    assert!(!media.local_exists(&account, &old.media_file_id).unwrap());
    assert!(media.local_exists(&account, &recent.media_file_id).unwrap());
}

#[test]
fn checksum_mismatch_quarantines_the_file_instead_of_serving_it() {
    let (dir, media, account) = setup();
    let source = dir.path().join("track.flac");
    fs::write(&source, b"original audio").expect("source");
    let imported = media
        .import_local_candidate(
            &account,
            "track-1",
            &source,
            LocalCandidateInput::lossless("flac", false),
            "device-a",
        )
        .expect("import");
    fs::write(&imported.absolute_path, b"tampered audio").expect("tamper");

    let outcome = media
        .resolve(&account, "track-1", &BTreeSet::new())
        .expect("resolve");

    assert_eq!(outcome, ResolveOutcome::Unavailable);
    assert_eq!(
        media
            .local_status(&account, &imported.media_file_id)
            .expect("status"),
        Some(MediaFileStatus::Quarantined)
    );
    assert!(!imported.absolute_path.exists());
    assert!(media.quarantine_path(&imported.media_file_id).exists());
}
