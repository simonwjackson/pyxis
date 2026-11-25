//! One-shot import of the staged 2026-11-24 zao recovery manifest.

use std::collections::{BTreeMap, HashMap};
use std::fs::{self, File};
use std::io::Read;
use std::path::{Component, Path};

use anyhow::{Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::db::store::{AccountId, Store};
use crate::fidelity_upgrades::{
    library_match_item, playback_safe_format, probe_error_code, probed_recording_matches,
    record_local_upgrade,
};
use crate::instance_lock::InstanceLock;
use crate::library::Library;
use crate::matching::Matcher;
use crate::media::probe::{AudioProbe, FfprobeAudioProbe};
use crate::media::{Fidelity, LocalCandidateInput, Media};

const UPDATED_BY: &str = "operator:zao-import-20261124";

// Deliberately do not deserialize advertised format/fidelity or old media ids.
// They are provenance, not import authority.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    account_id: String,
    entries: Vec<Entry>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Entry {
    track_id: String,
    file: String,
    sha256: String,
    bytes: u64,
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    dry_run: bool,
    imported: u64,
    bytes: u64,
    would_import: u64,
    would_import_bytes: u64,
    skipped: BTreeMap<String, u64>,
    skips: Vec<Skip>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Skip {
    track_id: String,
    file: String,
    reason: String,
    detail: Option<String>,
}

impl ImportSummary {
    fn skip(&mut self, entry: &Entry, reason: &str, detail: Option<String>) {
        *self.skipped.entry(reason.into()).or_default() += 1;
        self.skips.push(Skip {
            track_id: entry.track_id.clone(),
            file: entry.file.clone(),
            reason: reason.into(),
            detail,
        });
    }
}

pub fn run(state_dir: &Path, manifest_path: &Path, dry_run: bool) -> Result<ImportSummary> {
    // This lock must precede any database read, including a dry run.
    let _lock = InstanceLock::acquire_existing(state_dir)?;
    let manifest: Manifest =
        serde_json::from_reader(File::open(manifest_path).context("open import manifest")?)
            .context("decode import manifest")?;
    anyhow::ensure!(
        !manifest.account_id.is_empty(),
        "accountId must not be empty"
    );
    let store = Store::open_existing(state_dir)?;
    anyhow::ensure!(
        store
            .get_account::<serde_json::Value>(&manifest.account_id)?
            .is_some(),
        "manifest account does not exist: {}",
        manifest.account_id
    );
    let account = AccountId::new(manifest.account_id);
    let library = Library::open(store.clone());
    // Removed albums can leave orphan track records. Match the upgrader's actual
    // library membership and deterministic first-album selection, not just track IDs.
    let mut albums = library.list_albums(&account)?;
    albums.sort_by(|left, right| left.id.cmp(&right.id));
    let mut targets = HashMap::new();
    for album in &albums {
        for track in &album.tracks {
            targets
                .entry(track.id.clone())
                .or_insert_with(|| library_match_item(album, track));
        }
    }
    let matcher = Matcher::open(store.clone());
    // Serving resolution touches access times and can quarantine. Inspection must not.
    let media = Media::inspect(store.clone());
    let probe = FfprobeAudioProbe::default();
    let files = manifest_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join("files");
    let mut summary = ImportSummary {
        dry_run,
        ..Default::default()
    };
    let mut planned: HashMap<String, Fidelity> = HashMap::new();

    for entry in manifest.entries {
        let Some(target) = targets.get(&entry.track_id) else {
            summary.skip(&entry, "track.missing", None);
            continue;
        };
        let mut components = Path::new(&entry.file).components();
        if !matches!(components.next(), Some(Component::Normal(_))) || components.next().is_some() {
            summary.skip(&entry, "file.path", None);
            continue;
        }
        let source = files.join(&entry.file);
        if !fs::symlink_metadata(&source).is_ok_and(|metadata| metadata.file_type().is_file()) {
            summary.skip(&entry, "file.unavailable", None);
            continue;
        }
        // Import exactly the bytes that passed hashing and probing, even if the
        // operator changes the staged source while this command runs. Dry runs
        // deliberately make no temporary files and inspect the source directly.
        let staged = if dry_run {
            None
        } else {
            match snapshot_source(&source) {
                Ok(staged) => Some(staged),
                Err(error) => {
                    summary.skip(&entry, "file.io", Some(error.to_string()));
                    continue;
                }
            }
        };
        let import_source = staged.as_ref().map_or(source.as_path(), |file| file.path());
        let (bytes, sha256) = match digest(import_source) {
            Ok(value) => value,
            Err(error) => {
                summary.skip(&entry, "file.io", Some(error.to_string()));
                continue;
            }
        };
        if bytes != entry.bytes || bytes == 0 {
            summary.skip(&entry, "file.bytes", None);
            continue;
        }
        if entry.sha256.len() != 64 || !sha256.eq_ignore_ascii_case(&entry.sha256) {
            summary.skip(&entry, "file.sha256", None);
            continue;
        }
        let probed = match probe.probe(import_source) {
            Ok(value) => value,
            Err(error) => {
                summary.skip(&entry, probe_error_code(&error), Some(error.to_string()));
                continue;
            }
        };
        if !playback_safe_format(&probed.format) {
            summary.skip(&entry, "format.unsupported", None);
            continue;
        }
        let mut candidate = target.clone();
        candidate.id = format!("{UPDATED_BY}:{}", target.id);
        candidate.year = None;
        if !probed_recording_matches(&matcher, &account, target, candidate, probed.duration_ms)? {
            summary.skip(&entry, "match.probedRejected", None);
            continue;
        }
        let current = media
            .best_local_fidelity(&account, &target.id)?
            .into_iter()
            .chain(planned.get(&target.id).copied())
            .max();
        if let Some(current) = current.filter(|current| *current >= probed.fidelity) {
            if !dry_run && current.lossless {
                record_local_upgrade(
                    &store,
                    &account,
                    &target.id,
                    current,
                    Utc::now(),
                    UPDATED_BY,
                )?;
            }
            summary.skip(&entry, "fidelity.notImproved", None);
            continue;
        }
        if dry_run {
            summary.would_import += 1;
            summary.would_import_bytes += bytes;
            planned.insert(target.id.clone(), probed.fidelity);
            continue;
        }
        // The 50 GiB cap belongs to automatic acquisition, not Media imports. Do not
        // evict existing user data to recover these operator-staged files.
        let imported = media
            .import_local_candidate(
                &account,
                &target.id,
                import_source,
                LocalCandidateInput {
                    format: Some(probed.format),
                    fidelity: probed.fidelity,
                    pinned: false,
                },
                UPDATED_BY,
            )
            .with_context(|| format!("import track {} from {}", target.id, source.display()))?;
        summary.imported += 1;
        summary.bytes += imported.bytes;
        record_local_upgrade(
            &store,
            &account,
            &target.id,
            probed.fidelity,
            Utc::now(),
            UPDATED_BY,
        )?;
    }
    // NativeRuntime::close flushes even unchanged snapshots. All actual mutations
    // already commit durably; dropping this inspection handle avoids that extra write.
    Ok(summary)
}

fn snapshot_source(path: &Path) -> std::io::Result<tempfile::NamedTempFile> {
    let mut snapshot = tempfile::NamedTempFile::new()?;
    std::io::copy(&mut File::open(path)?, snapshot.as_file_mut())?;
    Ok(snapshot)
}

fn digest(path: &Path) -> std::io::Result<(u64, String)> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut bytes = 0;
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        bytes += read as u64;
        hasher.update(&buffer[..read]);
    }
    Ok((bytes, format!("{:x}", hasher.finalize())))
}
