//! Deep media module: candidate registration, fidelity resolution and local file storage.

pub mod candidates;
pub mod fidelity;
pub mod store;

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use crate::db::store::{AccountId, Store};

pub use candidates::{
    CandidateLocation, MediaCandidate, PluginCandidateInput, ResolveOutcome, ResolvedCandidate,
    ResolvedLocation,
};
pub use fidelity::Fidelity;
pub use store::MediaFileStatus;

use candidates::{CandidateError, CandidateRepository};
use store::{Eviction, LocalMediaStore, MediaStoreError};

#[derive(Debug, thiserror::Error)]
pub enum MediaError {
    #[error(transparent)]
    Candidate(#[from] CandidateError),
    #[error(transparent)]
    Store(#[from] MediaStoreError),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LocalCandidateInput {
    pub format: Option<String>,
    pub fidelity: Fidelity,
    pub pinned: bool,
}

impl LocalCandidateInput {
    pub fn lossless(format: &str, pinned: bool) -> Self {
        LocalCandidateInput {
            format: Some(format.into()),
            fidelity: Fidelity {
                lossless: true,
                bitrate_kbps: None,
                sample_rate_hz: None,
            },
            pinned,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImportedLocalCandidate {
    pub candidate: MediaCandidate,
    pub media_file_id: String,
    pub absolute_path: PathBuf,
    pub bytes: u64,
}

#[derive(Clone)]
pub struct Media {
    candidates: CandidateRepository,
    local: LocalMediaStore,
}

impl Media {
    pub fn open(store: Store) -> Result<Self, MediaError> {
        Ok(Media {
            candidates: CandidateRepository::new(store.clone()),
            local: LocalMediaStore::open(store)?,
        })
    }

    pub fn add_plugin_candidate(
        &self,
        account: &AccountId,
        track_id: &str,
        input: PluginCandidateInput,
        updated_by: &str,
    ) -> Result<MediaCandidate, MediaError> {
        Ok(self
            .candidates
            .add_plugin(account, track_id, input, updated_by)?)
    }

    pub fn ensure_plugin_candidate(
        &self,
        account: &AccountId,
        track_id: &str,
        input: PluginCandidateInput,
        updated_by: &str,
    ) -> Result<MediaCandidate, MediaError> {
        Ok(self
            .candidates
            .ensure_plugin(account, track_id, input, updated_by)?)
    }

    pub fn ensure_plugin_candidates(
        &self,
        account: &AccountId,
        inputs: Vec<(String, PluginCandidateInput)>,
        updated_by: &str,
    ) -> Result<Vec<MediaCandidate>, MediaError> {
        Ok(self
            .candidates
            .ensure_plugins(account, inputs, updated_by)?)
    }

    pub fn import_local_candidate(
        &self,
        account: &AccountId,
        track_id: &str,
        source: &Path,
        input: LocalCandidateInput,
        updated_by: &str,
    ) -> Result<ImportedLocalCandidate, MediaError> {
        let imported = self.local.import(
            account,
            source,
            input.format.clone(),
            input.pinned,
            updated_by,
        )?;
        let candidate = match self.candidates.add_local(
            account,
            track_id,
            imported.id.clone(),
            input.format,
            input.fidelity,
            updated_by,
        ) {
            Ok(candidate) => candidate,
            Err(error) => {
                let _ = self.local.delete(account, &imported.id);
                return Err(error.into());
            }
        };

        Ok(ImportedLocalCandidate {
            candidate,
            media_file_id: imported.id,
            absolute_path: imported.absolute_path,
            bytes: imported.bytes,
        })
    }

    pub fn resolve_id(
        &self,
        account: &AccountId,
        track_id: &str,
        candidate_id: &str,
        live_plugin_ids: &BTreeSet<String>,
    ) -> Result<ResolveOutcome, MediaError> {
        Ok(self.candidates.resolve_id(
            account,
            track_id,
            candidate_id,
            live_plugin_ids,
            &self.local,
        )?)
    }

    pub fn resolve(
        &self,
        account: &AccountId,
        track_id: &str,
        live_plugin_ids: &BTreeSet<String>,
    ) -> Result<ResolveOutcome, MediaError> {
        Ok(self
            .candidates
            .resolve(account, track_id, live_plugin_ids, &self.local)?)
    }

    pub fn touch_local(
        &self,
        account: &AccountId,
        media_file_id: &str,
        updated_by: &str,
    ) -> Result<bool, MediaError> {
        Ok(self.local.touch(account, media_file_id, updated_by)?)
    }

    pub fn local_exists(
        &self,
        account: &AccountId,
        media_file_id: &str,
    ) -> Result<bool, MediaError> {
        Ok(self.local.exists(account, media_file_id)?)
    }

    pub fn local_status(
        &self,
        account: &AccountId,
        media_file_id: &str,
    ) -> Result<Option<MediaFileStatus>, MediaError> {
        Ok(self.local.status(account, media_file_id)?)
    }

    pub fn quarantine_path(&self, media_file_id: &str) -> PathBuf {
        self.local.quarantine_path(media_file_id)
    }

    pub fn evict(
        &self,
        account: &AccountId,
        budget: u64,
        retain: &BTreeSet<String>,
        _updated_by: &str,
    ) -> Result<Eviction, MediaError> {
        let eviction = self.local.evict(account, budget, retain)?;
        self.candidates.remove_for_media_files(
            account,
            &eviction.removed_media_file_ids.iter().cloned().collect(),
        )?;
        Ok(eviction)
    }
}
