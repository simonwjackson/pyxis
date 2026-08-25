use std::collections::{BTreeSet, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use ulid::Ulid;

use crate::db::schema;
use crate::db::store::{AccountId, Store, StoreError};
use crate::library::placement::Placement;
use crate::library::{Album, Library, LibraryError, Track};
use crate::matching::{Decision, MatchItem, Matcher};
use crate::media::probe::{AudioProbe, ProbeError};
use crate::media::{
    Fidelity, LocalCandidateInput, Media, MediaError, ResolveOutcome, ResolvedLocation,
};
use crate::plugin_credentials::{CredentialError, CredentialVault};
use crate::plugins::host::{PluginCallError, PluginHost};
use crate::plugins::protocol::PluginCapability;
use crate::plugins::registry::PluginStatus;
use crate::sessions::{SessionError, Sessions};

const PROVIDER_ID: &str = "soulseek";
const MAX_SEARCH_RESULTS: usize = 100;
const MAX_DOWNLOAD_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const DOWNLOAD_CALL_TIMEOUT: Duration = Duration::from_secs(7 * 60 * 60);
const ACQUISITION_BUDGET_BYTES: u64 = 50 * 1024 * 1024 * 1024;
const ATTEMPT_LEASE_SECONDS: i64 = 35 * 60;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum UpgradeRun {
    Idle,
    Deferred {
        track_id: String,
        code: String,
    },
    Rejected {
        track_id: String,
        code: String,
    },
    Satisfied {
        track_id: String,
    },
    Upgraded {
        track_id: String,
        format: String,
        fidelity: Fidelity,
    },
}

#[derive(Debug, thiserror::Error)]
pub enum UpgradeError {
    #[error(transparent)]
    Store(#[from] StoreError),
    #[error(transparent)]
    Library(#[from] LibraryError),
    #[error(transparent)]
    Media(#[from] MediaError),
    #[error(transparent)]
    Credentials(#[from] CredentialError),
    #[error(transparent)]
    Sessions(#[from] SessionError),
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

pub struct FidelityUpgradeDependencies {
    pub store: Store,
    pub library: Library,
    pub matcher: Matcher,
    pub media: Media,
    pub credentials: CredentialVault,
    pub plugins: PluginHost,
    pub sessions: Sessions,
}

#[derive(Clone)]
pub struct FidelityUpgrader {
    store: Store,
    library: Library,
    matcher: Matcher,
    media: Media,
    credentials: CredentialVault,
    plugins: PluginHost,
    sessions: Sessions,
    probe: Arc<dyn AudioProbe>,
    staging_root: PathBuf,
    mutation: Arc<Mutex<()>>,
    cancellation: Arc<AtomicBool>,
}

impl FidelityUpgrader {
    pub fn new(
        dependencies: FidelityUpgradeDependencies,
        probe: Arc<dyn AudioProbe>,
    ) -> Result<Self, UpgradeError> {
        let FidelityUpgradeDependencies {
            store,
            library,
            matcher,
            media,
            credentials,
            plugins,
            sessions,
        } = dependencies;
        let staging_root = store.state_dir().join("media").join("acquisitions");
        fs::create_dir_all(&staging_root)?;
        Ok(FidelityUpgrader {
            store,
            library,
            matcher,
            media,
            credentials,
            plugins,
            sessions,
            probe,
            staging_root,
            mutation: Arc::new(Mutex::new(())),
            cancellation: Arc::new(AtomicBool::new(false)),
        })
    }

    pub fn cancel(&self) {
        self.cancellation.store(true, Ordering::Relaxed);
    }

    pub fn run_once(&self, now: DateTime<Utc>) -> Result<UpgradeRun, UpgradeError> {
        if self.cancellation.load(Ordering::Relaxed) {
            return Ok(UpgradeRun::Idle);
        }
        let _guard = self.mutation.lock().expect("fidelity upgrader poisoned");
        self.cleanup_staging()?;
        if !self.provider_is_live() {
            return Ok(UpgradeRun::Idle);
        }

        for account in self.store.list_accounts::<AccountIdentity>()? {
            let account_id = AccountId::new(account.id);
            let Some(config) = self.credentials.get(&account_id, PROVIDER_ID)? else {
                continue;
            };
            let jobs = self
                .store
                .list::<UpgradeJobRecord>(schema::FIDELITY_UPGRADE_JOBS, &account_id)?
                .into_iter()
                .map(|job| (job.track_id.clone(), job))
                .collect::<HashMap<_, _>>();
            for target in self.targets(&account_id)? {
                let job = jobs.get(&target.track.id);
                if !job_is_due(job, now) {
                    continue;
                }
                return self.attempt(
                    &account_id,
                    config.clone().into(),
                    target,
                    job.cloned(),
                    now,
                );
            }
        }
        Ok(UpgradeRun::Idle)
    }

    fn active_media_file_ids(&self, account: &AccountId) -> Result<BTreeSet<String>, UpgradeError> {
        let mut retain = BTreeSet::new();
        let live = self.plugins.live_ids();
        for track_id in self.sessions.active_track_ids(account)? {
            if let ResolveOutcome::Ready(candidate) =
                self.media.resolve(account, &track_id, &live)?
            {
                if let ResolvedLocation::Local { media_file_id, .. } = candidate.location {
                    retain.insert(media_file_id);
                }
            }
        }
        Ok(retain)
    }

    fn provider_is_live(&self) -> bool {
        self.plugins.list().into_iter().any(|plugin| {
            plugin.id == PROVIDER_ID
                && plugin.status == PluginStatus::Live
                && plugin
                    .capabilities
                    .iter()
                    .any(|capability| capability == PluginCapability::Provider.as_str())
        })
    }

    fn targets(&self, account: &AccountId) -> Result<Vec<UpgradeTarget>, UpgradeError> {
        let mut seen = HashSet::new();
        let mut targets = Vec::new();
        let mut albums = self.library.list_albums(account)?;
        albums.sort_by(|left, right| left.id.cmp(&right.id));
        for album in albums {
            if album.placement == Placement::Dismissed {
                continue;
            }
            for track in &album.tracks {
                if seen.insert(track.id.clone()) {
                    targets.push(UpgradeTarget {
                        album: album.clone(),
                        track: track.clone(),
                    });
                }
            }
        }
        Ok(targets)
    }

    fn attempt(
        &self,
        account: &AccountId,
        config: Value,
        target: UpgradeTarget,
        previous: Option<UpgradeJobRecord>,
        now: DateTime<Utc>,
    ) -> Result<UpgradeRun, UpgradeError> {
        let live = self.plugins.live_ids();
        let current = match self.media.resolve(account, &target.track.id, &live)? {
            ResolveOutcome::Ready(candidate) => candidate.fidelity,
            ResolveOutcome::Unavailable => Fidelity {
                lossless: false,
                bitrate_kbps: None,
                sample_rate_hz: None,
            },
        };
        if current.lossless {
            self.save_job(account, &target.track.id, previous, "satisfied", now, None)?;
            return Ok(UpgradeRun::Satisfied {
                track_id: target.track.id,
            });
        }

        let mut job =
            previous.unwrap_or_else(|| UpgradeJobRecord::new(account, &target.track.id, now));
        job.status = "attempting".into();
        job.last_attempt_at = Some(now.to_rfc3339());
        job.lease_until =
            Some((now + chrono::Duration::seconds(ATTEMPT_LEASE_SECONDS)).to_rfc3339());
        job.last_error_code = None;
        job.revision += 1;
        job.updated_by = "provider:soulseek".into();
        job.updated_at = now.to_rfc3339();
        self.put_job(account, &job)?;

        let search = self.plugins.call_for_account(
            PROVIDER_ID,
            "provider",
            "upgrade.search",
            json!({
                "track": target_json(&target),
                "currentFidelity": current,
                "maxResults": MAX_SEARCH_RESULTS,
            }),
            account.as_str(),
            Some(config.clone()),
        );
        let response = match search {
            Ok(value) => parse_search(value),
            Err(error) => {
                return self.defer(account, job, now, plugin_error_code(&error));
            }
        };
        let candidates = match response {
            Ok(response) => response.candidates,
            Err(code) => return self.reject(account, job, now, code),
        };
        let selected = match self.select_candidate(account, &target, current, candidates)? {
            Selection::Ready(candidate) => candidate,
            Selection::Deferred(code) => return self.defer(account, job, now, code),
            Selection::Rejected(code) => return self.reject(account, job, now, code),
        };

        let staging = StagingFile::new(&self.staging_root)?;
        let download = self.plugins.call_for_account_with_timeout(
            PROVIDER_ID,
            "provider",
            "upgrade.download",
            json!({
                "candidateRef": selected.candidate_ref,
                "destinationPath": staging.path(),
                "expectedBytes": selected.size_bytes,
                "maxBytes": MAX_DOWNLOAD_BYTES,
            }),
            account.as_str(),
            Some(config),
            DOWNLOAD_CALL_TIMEOUT,
            self.cancellation.clone(),
        );
        let downloaded = match download {
            Ok(value) => parse_download(value, staging.path()),
            Err(error) => return self.defer(account, job, now, plugin_error_code(&error)),
        };
        let downloaded = match downloaded {
            Ok(downloaded) => downloaded,
            Err(code) => return self.reject(account, job, now, code),
        };
        let metadata = fs::metadata(staging.path())?;
        if !metadata.is_file()
            || metadata.len() == 0
            || metadata.len() > MAX_DOWNLOAD_BYTES
            || metadata.len() != downloaded.bytes
            || metadata.len() != selected.size_bytes
        {
            return self.reject(account, job, now, "download.bytes".into());
        }

        let probed = match self.probe.probe(staging.path()) {
            Ok(probed) => probed,
            Err(error) => {
                return self.reject(account, job, now, probe_error_code(&error).into());
            }
        };
        if !matches!(
            probed.format.as_str(),
            "flac" | "wav" | "mp3" | "m4a" | "aac"
        ) {
            return self.reject(account, job, now, "format.unsupported".into());
        }
        if probed.fidelity <= current {
            return self.reject(account, job, now, "fidelity.notImproved".into());
        }
        if !self.probed_match(account, &target, &selected, probed.duration_ms)? {
            return self.reject(account, job, now, "match.probedRejected".into());
        }

        let budget_before = ACQUISITION_BUDGET_BYTES.saturating_sub(metadata.len());
        let eviction = self.media.evict(
            account,
            budget_before,
            &self.active_media_file_ids(account)?,
            "provider:soulseek",
        )?;
        if eviction.bytes_after > budget_before {
            return self.defer(account, job, now, "storage.budget".into());
        }
        self.media.import_local_candidate(
            account,
            &target.track.id,
            staging.path(),
            LocalCandidateInput {
                format: Some(probed.format.clone()),
                fidelity: probed.fidelity,
                pinned: false,
            },
            "provider:soulseek",
        )?;
        job.status = if probed.fidelity.lossless {
            "satisfied".into()
        } else {
            "retry".into()
        };
        job.attempts += 1;
        job.next_attempt_at = if probed.fidelity.lossless {
            (now + chrono::Duration::days(7)).to_rfc3339()
        } else {
            (now + retry_delay(job.attempts)).to_rfc3339()
        };
        job.lease_until = None;
        job.last_error_code = None;
        job.revision += 1;
        job.updated_at = now.to_rfc3339();
        self.put_job(account, &job)?;
        Ok(UpgradeRun::Upgraded {
            track_id: target.track.id,
            format: probed.format,
            fidelity: probed.fidelity,
        })
    }

    fn select_candidate(
        &self,
        account: &AccountId,
        target: &UpgradeTarget,
        current: Fidelity,
        candidates: Vec<UpgradeCandidate>,
    ) -> Result<Selection, UpgradeError> {
        let mut accepted = Vec::new();
        for candidate in candidates {
            if candidate.advertised_fidelity <= current {
                continue;
            }
            let result = self.matcher.decide(
                account,
                &target_match_item(target),
                &candidate_match_item(&candidate),
            )?;
            if result.decision == Decision::AutoMerge {
                accepted.push((candidate, result.score.overall));
            }
        }
        if accepted.is_empty() {
            return Ok(Selection::Deferred("search.noAcceptableMatch".into()));
        }
        accepted.sort_by(|(left, left_score), (right, right_score)| {
            right_score
                .cmp(left_score)
                .then_with(|| right.advertised_fidelity.cmp(&left.advertised_fidelity))
                .then_with(|| right.free_slot.cmp(&left.free_slot))
                .then_with(|| left.queue_length.cmp(&right.queue_length))
        });
        let (best, best_score) = accepted.remove(0);
        let best_identity = candidate_identity(&best);
        if accepted.iter().any(|(candidate, score)| {
            *score == best_score && candidate_identity(candidate) != best_identity
        }) {
            return Ok(Selection::Rejected("match.ambiguous".into()));
        }
        Ok(Selection::Ready(best))
    }

    fn probed_match(
        &self,
        account: &AccountId,
        target: &UpgradeTarget,
        candidate: &UpgradeCandidate,
        duration_ms: Option<u32>,
    ) -> Result<bool, UpgradeError> {
        let mut item = candidate_match_item(candidate);
        item.duration_ms = duration_ms;
        Ok(self
            .matcher
            .decide(account, &target_match_item(target), &item)?
            .decision
            == Decision::AutoMerge)
    }

    fn defer(
        &self,
        account: &AccountId,
        mut job: UpgradeJobRecord,
        now: DateTime<Utc>,
        code: String,
    ) -> Result<UpgradeRun, UpgradeError> {
        job.status = "retry".into();
        job.attempts += 1;
        let delay = if code == "search.noAcceptableMatch" {
            chrono::Duration::days(7)
        } else {
            retry_delay(job.attempts)
        };
        job.next_attempt_at = (now + delay).to_rfc3339();
        job.lease_until = None;
        job.last_error_code = Some(bounded_code(&code));
        job.revision += 1;
        job.updated_at = now.to_rfc3339();
        self.put_job(account, &job)?;
        Ok(UpgradeRun::Deferred {
            track_id: job.track_id,
            code,
        })
    }

    fn reject(
        &self,
        account: &AccountId,
        mut job: UpgradeJobRecord,
        now: DateTime<Utc>,
        code: String,
    ) -> Result<UpgradeRun, UpgradeError> {
        job.status = "retry".into();
        job.attempts += 1;
        job.next_attempt_at = (now + chrono::Duration::days(30)).to_rfc3339();
        job.lease_until = None;
        job.last_error_code = Some(bounded_code(&code));
        job.revision += 1;
        job.updated_at = now.to_rfc3339();
        self.put_job(account, &job)?;
        Ok(UpgradeRun::Rejected {
            track_id: job.track_id,
            code,
        })
    }

    fn save_job(
        &self,
        account: &AccountId,
        track_id: &str,
        previous: Option<UpgradeJobRecord>,
        status: &str,
        now: DateTime<Utc>,
        code: Option<&str>,
    ) -> Result<(), UpgradeError> {
        let mut job = previous.unwrap_or_else(|| UpgradeJobRecord::new(account, track_id, now));
        job.status = status.into();
        job.next_attempt_at = (now + chrono::Duration::days(7)).to_rfc3339();
        job.lease_until = None;
        job.last_error_code = code.map(bounded_code);
        job.revision += 1;
        job.updated_at = now.to_rfc3339();
        self.put_job(account, &job)
    }

    fn put_job(&self, account: &AccountId, job: &UpgradeJobRecord) -> Result<(), UpgradeError> {
        self.store
            .put(schema::FIDELITY_UPGRADE_JOBS, account, &job.id, job)?;
        Ok(())
    }

    fn cleanup_staging(&self) -> Result<(), UpgradeError> {
        for entry in fs::read_dir(&self.staging_root)? {
            let entry = entry?;
            if entry.file_type()?.is_file() {
                let _ = fs::remove_file(entry.path());
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone)]
struct UpgradeTarget {
    album: Album,
    track: Track,
}

#[derive(Debug)]
enum Selection {
    Ready(UpgradeCandidate),
    Deferred(String),
    Rejected(String),
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpgradeSearchResponse {
    candidates: Vec<UpgradeCandidate>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpgradeCandidate {
    candidate_ref: String,
    artist: String,
    title: String,
    #[serde(default)]
    album: Option<String>,
    #[serde(default)]
    duration_ms: Option<u32>,
    format: String,
    advertised_fidelity: Fidelity,
    size_bytes: u64,
    free_slot: bool,
    queue_length: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpgradeDownloadResponse {
    destination_path: String,
    bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpgradeJobRecord {
    id: String,
    account_id: String,
    provider_id: String,
    track_id: String,
    status: String,
    attempts: u32,
    next_attempt_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    last_attempt_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    lease_until: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    last_error_code: Option<String>,
    revision: u64,
    updated_by: String,
    updated_at: String,
}

impl UpgradeJobRecord {
    fn new(account: &AccountId, track_id: &str, now: DateTime<Utc>) -> Self {
        UpgradeJobRecord {
            id: format!("{PROVIDER_ID}:{track_id}"),
            account_id: account.as_str().into(),
            provider_id: PROVIDER_ID.into(),
            track_id: track_id.into(),
            status: "pending".into(),
            attempts: 0,
            next_attempt_at: now.to_rfc3339(),
            last_attempt_at: None,
            lease_until: None,
            last_error_code: None,
            revision: 1,
            updated_by: "provider:soulseek".into(),
            updated_at: now.to_rfc3339(),
        }
    }
}

#[derive(Deserialize)]
struct AccountIdentity {
    id: String,
}

struct StagingFile {
    path: PathBuf,
}

impl StagingFile {
    fn new(root: &Path) -> Result<Self, std::io::Error> {
        fs::create_dir_all(root)?;
        Ok(StagingFile {
            path: root.join(format!("{}.partial", Ulid::new())),
        })
    }

    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for StagingFile {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}

fn parse_search(value: Value) -> Result<UpgradeSearchResponse, String> {
    let response: UpgradeSearchResponse =
        serde_json::from_value(value).map_err(|_| "provider.invalidSearch".to_string())?;
    if response.candidates.len() > MAX_SEARCH_RESULTS
        || response.candidates.iter().any(|candidate| {
            candidate.candidate_ref.is_empty()
                || candidate.candidate_ref.len() > 128
                || candidate.artist.is_empty()
                || candidate.artist.len() > 512
                || candidate.title.is_empty()
                || candidate.title.len() > 512
                || candidate
                    .album
                    .as_ref()
                    .is_some_and(|album| album.len() > 512)
                || candidate.format.is_empty()
                || candidate.format.len() > 32
                || candidate.size_bytes == 0
                || candidate.size_bytes > MAX_DOWNLOAD_BYTES
        })
    {
        return Err("provider.invalidSearch".into());
    }
    Ok(response)
}

fn parse_download(value: Value, path: &Path) -> Result<UpgradeDownloadResponse, String> {
    let response: UpgradeDownloadResponse =
        serde_json::from_value(value).map_err(|_| "provider.invalidDownload".to_string())?;
    if response.destination_path != path.to_string_lossy() || response.bytes == 0 {
        return Err("provider.invalidDownload".into());
    }
    Ok(response)
}

fn target_json(target: &UpgradeTarget) -> Value {
    json!({
        "id": target.track.id,
        "artist": target.track.artist,
        "title": target.track.title,
        "album": target.album.title,
        "durationMs": target.track.duration_ms,
        "year": target.album.year,
    })
}

fn target_match_item(target: &UpgradeTarget) -> MatchItem {
    MatchItem {
        id: target.track.id.clone(),
        artist: target.track.artist.clone(),
        title: target.track.title.clone(),
        album: Some(target.album.title.clone()),
        duration_ms: target.track.duration_ms,
        year: target.album.year,
    }
}

fn candidate_match_item(candidate: &UpgradeCandidate) -> MatchItem {
    MatchItem {
        id: format!("soulseek:{}", candidate.candidate_ref),
        artist: candidate.artist.clone(),
        title: candidate.title.clone(),
        album: candidate.album.clone(),
        duration_ms: candidate.duration_ms,
        year: None,
    }
}

fn candidate_identity(candidate: &UpgradeCandidate) -> (&str, &str, Option<&str>, Option<u32>) {
    (
        candidate.artist.as_str(),
        candidate.title.as_str(),
        candidate.album.as_deref(),
        candidate.duration_ms,
    )
}

fn job_is_due(job: Option<&UpgradeJobRecord>, now: DateTime<Utc>) -> bool {
    let Some(job) = job else {
        return true;
    };
    if job.status == "attempting"
        && job
            .lease_until
            .as_deref()
            .and_then(|lease| DateTime::parse_from_rfc3339(lease).ok())
            .is_some_and(|lease| lease.with_timezone(&Utc) > now)
    {
        return false;
    }
    DateTime::parse_from_rfc3339(&job.next_attempt_at)
        .map(|due| due.with_timezone(&Utc) <= now)
        .unwrap_or(true)
}

fn retry_delay(attempts: u32) -> chrono::Duration {
    match attempts {
        0 | 1 => chrono::Duration::hours(6),
        2 => chrono::Duration::days(1),
        3 => chrono::Duration::days(3),
        4 => chrono::Duration::days(7),
        _ => chrono::Duration::days(30),
    }
}

fn bounded_code(code: &str) -> String {
    code.chars().take(64).collect()
}

fn plugin_error_code(error: &PluginCallError) -> String {
    match error {
        PluginCallError::Plugin { code, .. } => bounded_code(code),
        PluginCallError::Timeout { .. } => "provider.timeout".into(),
        PluginCallError::ProcessExited { .. } => "provider.exited".into(),
        PluginCallError::Unavailable { .. } => "provider.unavailable".into(),
        PluginCallError::CapabilityUnavailable { .. } => "provider.capability".into(),
        PluginCallError::Protocol { .. } => "provider.protocol".into(),
    }
}

fn probe_error_code(error: &ProbeError) -> &'static str {
    match error {
        ProbeError::Spawn(_) => "probe.unavailable",
        ProbeError::Timeout => "probe.timeout",
        ProbeError::Rejected => "probe.rejected",
        ProbeError::Invalid(_) => "probe.invalid",
        ProbeError::Io(_) => "probe.io",
    }
}
