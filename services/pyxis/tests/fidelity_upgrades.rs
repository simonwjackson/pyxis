use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use chrono::Utc;
use pyxis::accounts::{Accounts, AuthContext, Principal};
use pyxis::api::AppState;
use pyxis::db::store::{AccountId, Store};
use pyxis::fidelity_upgrades::{FidelityUpgradeDependencies, FidelityUpgrader, UpgradeRun};
use pyxis::library::{AlbumInput, Library, TrackInput};
use pyxis::matching::Matcher;
use pyxis::media::probe::{AudioProbe, ProbeError, ProbedAudio};
use pyxis::media::{Fidelity, LocalCandidateInput, Media};
use pyxis::plugin_credentials::CredentialVault;
use pyxis::plugins::host::{HostPolicy, PluginCandidate, PluginHost};
use pyxis::plugins::protocol::PluginValue;
use pyxis::rpc::contract::{
    EmptyRequest, PluginListOutcome, RpcRequest, RpcResponse, SystemStatusOutcome,
};
use pyxis::rpc::dispatch;
use pyxis::sessions::Sessions;

struct FixedProbe {
    audio: ProbedAudio,
}

struct RejectingProbe;

impl AudioProbe for RejectingProbe {
    fn probe(&self, _path: &Path) -> Result<ProbedAudio, ProbeError> {
        Err(ProbeError::Rejected)
    }
}

impl AudioProbe for FixedProbe {
    fn probe(&self, _path: &Path) -> Result<ProbedAudio, ProbeError> {
        Ok(self.audio.clone())
    }
}

fn provider_host(candidate: &str, bytes: &str, log: &Path) -> PluginHost {
    let executable = PathBuf::from(env!("CARGO_BIN_EXE_pyxis-plugin-laboratory"));
    PluginHost::start(
        vec![PluginCandidate::new(executable)
            .with_env("PYXIS_LAB_ID", "soulseek")
            .with_env("PYXIS_LAB_CAPABILITY", "provider")
            .with_env("PYXIS_LAB_UPGRADE_CANDIDATE", candidate)
            .with_env("PYXIS_LAB_UPGRADE_BYTES", bytes)
            .with_env("PYXIS_LAB_CALL_LOG", log.as_os_str())],
        HostPolicy::default(),
    )
    .expect("provider host")
}

fn setup(
    candidate: &str,
) -> (
    tempfile::TempDir,
    Store,
    Media,
    FidelityUpgrader,
    PathBuf,
    String,
) {
    setup_with_probe(
        candidate,
        Arc::new(FixedProbe {
            audio: ProbedAudio {
                format: "flac".into(),
                fidelity: Fidelity {
                    lossless: true,
                    bitrate_kbps: Some(900),
                    sample_rate_hz: Some(44_100),
                },
                duration_ms: Some(59_000),
            },
        }),
    )
}

fn setup_with_probe(
    candidate: &str,
    probe: Arc<dyn AudioProbe>,
) -> (
    tempfile::TempDir,
    Store,
    Media,
    FidelityUpgrader,
    PathBuf,
    String,
) {
    let dir = tempfile::tempdir().expect("temp dir");
    let store = Store::open(dir.path()).expect("store");
    Accounts::open(store.clone()).expect("accounts");
    let account = AccountId::new("default");
    let library = Library::open(store.clone());
    let album = library
        .add_album(
            &account,
            AlbumInput {
                title: "Geogaddi".into(),
                artist: "Boards of Canada".into(),
                year: Some(2002),
                source_reference: None,
                tracks: vec![TrackInput {
                    id: Some("track-1".into()),
                    title: "Ready Lets Go".into(),
                    artist: "Boards of Canada".into(),
                    duration_ms: Some(59_000),
                    track_number: Some(1),
                }],
            },
            "test",
        )
        .expect("album");
    let low = dir.path().join("low.mp3");
    std::fs::write(&low, b"low fidelity").expect("low bytes");
    let media = Media::open(store.clone()).expect("media");
    media
        .import_local_candidate(
            &account,
            &album.tracks[0].id,
            &low,
            LocalCandidateInput {
                format: Some("mp3".into()),
                fidelity: Fidelity {
                    lossless: false,
                    bitrate_kbps: Some(128),
                    sample_rate_hz: Some(44_100),
                },
                pinned: false,
            },
            "test",
        )
        .expect("low candidate");
    let log = dir.path().join("provider.log");
    let bytes = "verified-flac";
    let plugins = provider_host(candidate, bytes, &log);
    let credentials = CredentialVault::open(store.clone()).expect("credentials");
    credentials
        .set(
            &account,
            "soulseek",
            &PluginValue::Object(
                [
                    ("username".into(), PluginValue::String("listener".into())),
                    ("password".into(), PluginValue::String("secret".into())),
                ]
                .into_iter()
                .collect(),
            ),
            "test",
        )
        .expect("config");
    let upgrader = FidelityUpgrader::new(
        FidelityUpgradeDependencies {
            store: store.clone(),
            library,
            matcher: Matcher::open(store.clone()),
            media: media.clone(),
            credentials,
            plugins,
            sessions: Sessions::open(store.clone()),
        },
        probe,
    )
    .expect("upgrader");
    (dir, store, media, upgrader, log, album.tracks[0].id.clone())
}

#[test]
fn verified_lossless_download_becomes_the_resolved_candidate() {
    let bytes = "verified-flac";
    let candidate = format!(
        "opaque|Boards of Canada|Ready Lets Go|Geogaddi|59000|flac|true|900|44100|{}|true|0",
        bytes.len()
    );
    let (_dir, _store, media, upgrader, log, track_id) = setup(&candidate);
    let now = Utc::now();

    let result = upgrader.run_once(now).expect("upgrade run");

    assert!(matches!(
        result,
        UpgradeRun::Upgraded {
            ref format,
            fidelity: Fidelity { lossless: true, .. },
            ..
        } if format == "flac"
    ));
    let resolved = media
        .resolve(&AccountId::new("default"), &track_id, &Default::default())
        .expect("resolve")
        .ready()
        .expect("ready");
    assert!(resolved.fidelity.lossless);
    media
        .evict(&AccountId::new("default"), 0, &BTreeSet::new(), "test")
        .expect("evict upgraded bytes");
    assert!(matches!(
        upgrader
            .run_once(now + chrono::Duration::days(8))
            .expect("reacquire run"),
        UpgradeRun::Upgraded { .. }
    ));
    let calls = std::fs::read_to_string(log).expect("calls");
    assert!(calls.contains("upgrade.search|"));
    assert!(calls.contains("upgrade.download|"));
}

#[test]
fn ambiguous_or_below_threshold_match_is_not_downloaded() {
    let candidate =
        "opaque|Different Artist|Different Song|Other Album|59000|flac|true|900|44100|13|true|0";
    let (_dir, _store, media, upgrader, log, track_id) = setup(candidate);

    let result = upgrader.run_once(Utc::now()).expect("upgrade run");

    assert!(matches!(result, UpgradeRun::Deferred { .. }));
    let resolved = media
        .resolve(&AccountId::new("default"), &track_id, &Default::default())
        .expect("resolve")
        .ready()
        .expect("ready");
    assert!(!resolved.fidelity.lossless);
    let calls = std::fs::read_to_string(log).expect("calls");
    assert!(!calls.contains("upgrade.download|"));
}

#[test]
fn searched_size_must_match_the_complete_download() {
    let candidate =
        "opaque|Boards of Canada|Ready Lets Go|Geogaddi|59000|flac|true|900|44100|999|true|0";
    let (_dir, _store, media, upgrader, _log, track_id) = setup(candidate);

    let result = upgrader.run_once(Utc::now()).expect("upgrade run");

    assert!(matches!(result, UpgradeRun::Rejected { ref code, .. } if code == "download.bytes"));
    let resolved = media
        .resolve(&AccountId::new("default"), &track_id, &Default::default())
        .expect("resolve")
        .ready()
        .expect("ready");
    assert!(!resolved.fidelity.lossless);
}

#[test]
fn rejected_download_leaves_no_partial_or_candidate() {
    let bytes = "verified-flac";
    let candidate = format!(
        "opaque|Boards of Canada|Ready Lets Go|Geogaddi|59000|flac|true|900|44100|{}|true|0",
        bytes.len()
    );
    let (dir, _store, media, upgrader, _log, track_id) =
        setup_with_probe(&candidate, Arc::new(RejectingProbe));

    let result = upgrader.run_once(Utc::now()).expect("upgrade run");

    assert!(matches!(result, UpgradeRun::Rejected { .. }));
    assert!(std::fs::read_dir(dir.path().join("media/acquisitions"))
        .expect("staging")
        .next()
        .is_none());
    let resolved = media
        .resolve(&AccountId::new("default"), &track_id, &Default::default())
        .expect("resolve")
        .ready()
        .expect("ready");
    assert!(!resolved.fidelity.lossless);
}

#[test]
fn provider_only_plugin_is_absent_from_public_plugin_list() {
    let dir = tempfile::tempdir().expect("temp dir");
    let log = dir.path().join("provider.log");
    let state = AppState::open_with_plugins(
        Store::open(dir.path()).expect("store"),
        provider_host("", "", &log),
    )
    .expect("state");
    let response = dispatch::dispatch(
        &state,
        RpcRequest::PluginList(EmptyRequest {}),
        Some(AuthContext {
            account_id: AccountId::new("default"),
            principal: Principal::Device {
                id: "device".into(),
            },
        }),
    );
    assert!(matches!(
        response,
        RpcResponse::PluginList(PluginListOutcome::Ready(plugins)) if plugins.is_empty()
    ));
    let status = dispatch::dispatch(&state, RpcRequest::SystemStatusGet(EmptyRequest {}), None);
    assert!(matches!(
        status,
        RpcResponse::SystemStatusGet(SystemStatusOutcome::Ready(status))
            if status.plugin_count == 0 && status.capabilities.is_empty()
    ));
}
