use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

use pyxis::accounts::Accounts;
use pyxis::db::{
    schema,
    store::{AccountId, Store},
};
use pyxis::instance_lock::InstanceLock;
use pyxis::library::{AlbumInput, Library, TrackInput};
use pyxis::media::{Fidelity, LocalCandidateInput, Media};
use serde_json::{json, Value};

struct Fixture {
    _dir: tempfile::TempDir,
    state: PathBuf,
    manifest: PathBuf,
    audio: PathBuf,
    entry: Value,
}

impl Fixture {
    fn new() -> Self {
        let dir = tempfile::tempdir().unwrap();
        let state = dir.path().join("state");
        drop(InstanceLock::acquire(&state).unwrap());
        let store = Store::open(&state).unwrap();
        Accounts::open(store.clone()).unwrap();
        Library::open(store.clone())
            .add_album(
                &AccountId::new("default"),
                AlbumInput {
                    title: "Album".into(),
                    artist: "Artist".into(),
                    year: None,
                    artwork_url: None,
                    source_reference: None,
                    tracks: vec![TrackInput {
                        id: Some("track-1".into()),
                        title: "Song".into(),
                        artist: "Artist".into(),
                        duration_ms: Some(1000),
                        track_number: Some(1),
                    }],
                },
                "test",
            )
            .unwrap();
        store.close().unwrap();
        let files = dir.path().join("files");
        fs::create_dir(&files).unwrap();
        let audio = files.join("audio.wav");
        let generated = Command::new("ffmpeg")
            .args([
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:duration=1",
                "-c:a",
                "pcm_s16le",
            ])
            .arg(&audio)
            .output()
            .unwrap();
        assert!(
            generated.status.success(),
            "{}",
            String::from_utf8_lossy(&generated.stderr)
        );
        let digest = Command::new("sha256sum").arg(&audio).output().unwrap();
        assert!(digest.status.success());
        let sha = String::from_utf8(digest.stdout)
            .unwrap()
            .split_whitespace()
            .next()
            .unwrap()
            .to_owned();
        let entry = json!({"trackId":"track-1", "file":"audio.wav", "sha256":sha,
            "bytes":fs::metadata(&audio).unwrap().len(), "format":"mp3", "lossless":false,
            "bitrateKbps":1, "sampleRateHz":1, "zaoMediaFileId":"old-id", "replacesLive":null});
        let manifest = dir.path().join("manifest.json");
        let fixture = Self {
            _dir: dir,
            state,
            manifest,
            audio,
            entry,
        };
        fixture.save(vec![fixture.entry.clone()]);
        fixture
    }

    fn save(&self, entries: Vec<Value>) {
        fs::write(
            &self.manifest,
            serde_json::to_vec(
                &json!({"accountId":"default", "source":"zao staged files", "entries":entries}),
            )
            .unwrap(),
        )
        .unwrap();
    }

    fn run(&self, dry_run: bool) -> Output {
        let mut command = Command::new(env!("CARGO_BIN_EXE_pyxis"));
        command
            .env("TMPDIR", self._dir.path())
            .args(["media", "import-local", "--state-dir"])
            .arg(&self.state)
            .arg("--manifest")
            .arg(&self.manifest);
        if dry_run {
            command.arg("--dry-run");
        }
        command.output().unwrap()
    }

    fn summary(&self, dry_run: bool) -> Value {
        let output = self.run(dry_run);
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        serde_json::from_slice(&output.stdout).unwrap()
    }
}

fn snapshot(path: &Path) -> BTreeMap<PathBuf, (Vec<u8>, std::time::SystemTime)> {
    let mut result = BTreeMap::from([(
        path.to_path_buf(),
        (Vec::new(), fs::metadata(path).unwrap().modified().unwrap()),
    )]);
    for entry in fs::read_dir(path).unwrap() {
        let path = entry.unwrap().path();
        if path.is_dir() {
            result.extend(snapshot(&path));
        } else {
            result.insert(
                path.clone(),
                (
                    fs::read(&path).unwrap(),
                    fs::metadata(&path).unwrap().modified().unwrap(),
                ),
            );
        }
    }
    result
}

#[test]
fn imports_probed_audio_and_reruns_without_duplicate_candidates() {
    let fixture = Fixture::new();
    let summary = fixture.summary(false);
    assert_eq!(summary["imported"], 1);
    assert_eq!(summary["bytes"], fixture.entry["bytes"]);
    let store = Store::open(&fixture.state).unwrap();
    let account = AccountId::new("default");
    let candidates: Vec<Value> = store.list(schema::TRACK_CANDIDATES, &account).unwrap();
    assert_eq!(candidates.len(), 1);
    assert_eq!(candidates[0]["format"], "wav");
    assert_eq!(candidates[0]["lossless"], true);
    assert_eq!(candidates[0]["sampleRateHz"], 44100);
    assert_eq!(candidates[0]["updatedBy"], "operator:zao-import-20261124");
    let jobs: Vec<Value> = store.list(schema::FIDELITY_UPGRADE_JOBS, &account).unwrap();
    assert_eq!(jobs[0]["status"], "satisfied");
    store.close().unwrap();
    let before = snapshot(&fixture.state);
    let rerun = fixture.summary(false);
    assert_eq!(rerun["imported"], 0);
    assert_eq!(rerun["skipped"]["fidelity.notImproved"], 1);
    assert_eq!(snapshot(&fixture.state), before);
}

#[test]
fn rejects_sha_and_byte_mismatches_and_missing_tracks() {
    let fixture = Fixture::new();
    let mut sha = fixture.entry.clone();
    sha["sha256"] = json!("0".repeat(64));
    let mut bytes = fixture.entry.clone();
    bytes["bytes"] = json!(1);
    let mut missing = fixture.entry.clone();
    missing["trackId"] = json!("deleted");
    fixture.save(vec![sha, bytes, missing]);
    let result = fixture.summary(false);
    assert_eq!(result["imported"], 0);
    for reason in ["file.sha256", "file.bytes", "track.missing"] {
        assert_eq!(result["skipped"][reason], 1);
    }
    assert_eq!(result["skips"].as_array().unwrap().len(), 3);
}

#[test]
fn rejects_probed_duration_mismatch() {
    let fixture = Fixture::new();
    let store = Store::open(&fixture.state).unwrap();
    let account = AccountId::new("default");
    let mut track: Value = store
        .get(schema::TRACKS, &account, "track-1")
        .unwrap()
        .unwrap();
    track["durationMs"] = json!(60000);
    store
        .put(schema::TRACKS, &account, "track-1", &track)
        .unwrap();
    store.close().unwrap();
    let summary = fixture.summary(false);
    assert_eq!(summary["imported"], 0);
    assert_eq!(summary["skipped"]["match.probedRejected"], 1);
}

#[test]
fn skips_an_existing_better_local_candidate() {
    let fixture = Fixture::new();
    let store = Store::open(&fixture.state).unwrap();
    Media::open(store.clone())
        .unwrap()
        .import_local_candidate(
            &AccountId::new("default"),
            "track-1",
            &fixture.audio,
            LocalCandidateInput {
                format: Some("wav".into()),
                fidelity: Fidelity {
                    lossless: true,
                    bitrate_kbps: Some(9999),
                    sample_rate_hz: Some(96000),
                },
                pinned: false,
            },
            "test",
        )
        .unwrap();
    store.close().unwrap();
    let summary = fixture.summary(false);
    assert_eq!(summary["imported"], 0);
    assert_eq!(summary["skipped"]["fidelity.notImproved"], 1);
}

#[test]
fn refuses_to_run_while_the_instance_lock_is_held() {
    let fixture = Fixture::new();
    let lock = InstanceLock::acquire(&fixture.state).unwrap();
    let before = snapshot(&fixture.state);
    for dry_run in [false, true] {
        let output = fixture.run(dry_run);
        assert!(!output.status.success());
        assert!(String::from_utf8_lossy(&output.stderr).contains("another Pyxis server owns"));
    }
    assert_eq!(snapshot(&fixture.state), before);
    drop(lock);
}

#[test]
fn dry_run_writes_no_files_even_when_old_placement_conversion_is_pending() {
    let fixture = Fixture::new();
    let store = Store::open(&fixture.state).unwrap();
    let account = AccountId::new("default");
    let mut album: Value = store
        .list::<Value>(schema::ALBUMS, &account)
        .unwrap()
        .remove(0);
    album["placement"] = json!("collection");
    store
        .put(
            schema::ALBUMS,
            &account,
            album["id"].as_str().unwrap(),
            &album,
        )
        .unwrap();
    store.close().unwrap();
    let before = snapshot(fixture._dir.path());
    let summary = fixture.summary(true);
    assert_eq!(summary["dryRun"], true);
    assert_eq!(summary["imported"], 0);
    assert_eq!(summary["wouldImport"], 1);
    assert_eq!(summary["bytes"], 0);
    assert_eq!(summary["wouldImportBytes"], fixture.entry["bytes"]);
    assert_eq!(snapshot(fixture._dir.path()), before);
}

#[test]
fn removed_album_does_not_reimport_its_orphan_track() {
    let fixture = Fixture::new();
    let store = Store::open(&fixture.state).unwrap();
    let account = AccountId::new("default");
    let library = Library::open(store.clone());
    let album = library.list_albums(&account).unwrap().remove(0);
    library.remove_album(&account, &album.id).unwrap();
    assert!(library.get_track(&account, "track-1").unwrap().is_some());
    store.close().unwrap();
    assert_eq!(fixture.summary(false)["skipped"]["track.missing"], 1);
}

#[test]
fn checksum_valid_non_audio_is_rejected_by_the_real_probe() {
    let mut fixture = Fixture::new();
    fs::write(&fixture.audio, b"this is not audio").unwrap();
    let digest = Command::new("sha256sum")
        .arg(&fixture.audio)
        .output()
        .unwrap();
    fixture.entry["sha256"] = json!(String::from_utf8(digest.stdout)
        .unwrap()
        .split_whitespace()
        .next()
        .unwrap());
    fixture.entry["bytes"] = json!(fs::metadata(&fixture.audio).unwrap().len());
    fixture.save(vec![fixture.entry.clone()]);
    let result = fixture.summary(false);
    assert_eq!(result["imported"], 0);
    assert_eq!(result["skipped"]["probe.rejected"], 1);
}

#[test]
fn dry_run_checks_existing_candidates_without_touching_or_quarantining() {
    let fixture = Fixture::new();
    let store = Store::open(&fixture.state).unwrap();
    let imported = Media::open(store.clone())
        .unwrap()
        .import_local_candidate(
            &AccountId::new("default"),
            "track-1",
            &fixture.audio,
            LocalCandidateInput::lossless("wav", false),
            "test",
        )
        .unwrap();
    fs::write(imported.absolute_path, b"corrupted local bytes").unwrap();
    store.close().unwrap();
    let before = snapshot(fixture._dir.path());
    let result = fixture.summary(true);
    assert_eq!(result["wouldImport"], 1);
    assert_eq!(snapshot(fixture._dir.path()), before);
    assert_eq!(fixture.summary(false)["imported"], 1);
}

#[test]
fn an_import_clears_the_previous_job_error_and_lease_and_keeps_attempt_history() {
    let fixture = Fixture::new();
    let store = Store::open(&fixture.state).unwrap();
    let account = AccountId::new("default");
    store
        .put(
            schema::FIDELITY_UPGRADE_JOBS,
            &account,
            "soulseek:track-1",
            &json!({
                "providerId":"soulseek", "trackId":"track-1", "status":"attempting",
                "attempts":3, "nextAttemptAt":"2026-11-25T00:00:00Z",
                "lastAttemptAt":"2026-11-24T00:00:00Z", "leaseUntil":"2026-11-26T00:00:00Z",
                "lastErrorCode":"provider.timeout", "revision":7,
                "updatedBy":"provider:soulseek", "updatedAt":"2026-11-24T00:00:00Z"
            }),
        )
        .unwrap();
    store.close().unwrap();
    let start = chrono::Utc::now();
    assert_eq!(fixture.summary(false)["imported"], 1);
    let store = Store::open(&fixture.state).unwrap();
    let job: Value = store
        .get(schema::FIDELITY_UPGRADE_JOBS, &account, "soulseek:track-1")
        .unwrap()
        .unwrap();
    assert_eq!(job["status"], "satisfied");
    assert_eq!(job["attempts"], 4);
    assert_eq!(job["revision"], 8);
    assert!(job.get("leaseUntil").is_none());
    assert!(job.get("lastErrorCode").is_none());
    assert_eq!(job["lastAttemptAt"], "2026-11-24T00:00:00Z");
    assert_eq!(job["updatedBy"], "operator:zao-import-20261124");
    let next =
        chrono::DateTime::parse_from_rfc3339(job["nextAttemptAt"].as_str().unwrap()).unwrap();
    assert!(next >= start + chrono::Duration::days(7));
    assert!(next <= chrono::Utc::now() + chrono::Duration::days(7));
}

#[test]
fn dry_run_projects_duplicate_entries_the_same_way_as_an_actual_run() {
    let fixture = Fixture::new();
    fixture.save(vec![fixture.entry.clone(), fixture.entry.clone()]);
    let before = snapshot(fixture._dir.path());
    let dry = fixture.summary(true);
    assert_eq!(dry["wouldImport"], 1);
    assert_eq!(dry["skipped"]["fidelity.notImproved"], 1);
    assert_eq!(snapshot(fixture._dir.path()), before);
    let real = fixture.summary(false);
    assert_eq!(real["imported"], 1);
    assert_eq!(real["skipped"], dry["skipped"]);
}

#[test]
fn refuses_missing_state_without_creating_it_and_rejects_path_traversal() {
    let mut fixture = Fixture::new();
    fixture.state = fixture._dir.path().join("missing-state");
    assert!(!fixture.run(true).status.success());
    assert!(!fixture.state.exists());
    fixture.state = fixture._dir.path().join("state");
    fixture.entry["file"] = json!("../audio.wav");
    fixture.save(vec![fixture.entry.clone()]);
    assert_eq!(fixture.summary(false)["skipped"]["file.path"], 1);
}

#[test]
fn lossy_import_keeps_the_background_job_retryable() {
    let mut fixture = Fixture::new();
    let mp3 = fixture.audio.with_extension("mp3");
    let converted = Command::new("ffmpeg")
        .args(["-v", "error", "-i"])
        .arg(&fixture.audio)
        .args(["-c:a", "libmp3lame", "-b:a", "128k"])
        .arg(&mp3)
        .output()
        .unwrap();
    assert!(
        converted.status.success(),
        "{}",
        String::from_utf8_lossy(&converted.stderr)
    );
    fixture.audio = mp3;
    fixture.entry["file"] = json!("audio.mp3");
    fixture.entry["lossless"] = json!(true);
    let digest = Command::new("sha256sum")
        .arg(&fixture.audio)
        .output()
        .unwrap();
    fixture.entry["sha256"] = json!(String::from_utf8(digest.stdout)
        .unwrap()
        .split_whitespace()
        .next()
        .unwrap());
    fixture.entry["bytes"] = json!(fs::metadata(&fixture.audio).unwrap().len());
    fixture.save(vec![fixture.entry.clone()]);
    let before = chrono::Utc::now();
    assert_eq!(fixture.summary(false)["imported"], 1);
    let store = Store::open(&fixture.state).unwrap();
    let account = AccountId::new("default");
    let job: Value = store
        .get(schema::FIDELITY_UPGRADE_JOBS, &account, "soulseek:track-1")
        .unwrap()
        .unwrap();
    assert_eq!(job["status"], "retry");
    let next =
        chrono::DateTime::parse_from_rfc3339(job["nextAttemptAt"].as_str().unwrap()).unwrap();
    assert!(next >= before + chrono::Duration::hours(6));
    assert!(next <= chrono::Utc::now() + chrono::Duration::hours(6));
    let candidates: Vec<Value> = store.list(schema::TRACK_CANDIDATES, &account).unwrap();
    assert_eq!(candidates[0]["lossless"], false);
    store.close().unwrap();
    assert_eq!(fixture.summary(false)["skipped"]["fidelity.notImproved"], 1);
}
