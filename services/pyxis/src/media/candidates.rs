//! Playable candidates and quality-first resolution.

use std::collections::BTreeSet;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use ulid::Ulid;

use crate::db::schema;
use crate::db::store::{AccountId, Store, StoreError};

use super::fidelity::Fidelity;
use super::store::{LocalMediaStore, MediaStoreError};

#[derive(Debug, thiserror::Error)]
pub enum CandidateError {
    #[error(transparent)]
    Store(#[from] StoreError),
    #[error(transparent)]
    Media(#[from] MediaStoreError),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PluginCandidateInput {
    pub plugin_id: String,
    pub external_id: String,
    pub format: Option<String>,
    pub fidelity: Fidelity,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CandidateLocation {
    Plugin {
        plugin_id: String,
        external_id: String,
    },
    Local {
        media_file_id: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidateMetadata {
    pub title: String,
    pub artist: String,
    // ProseQL deep-merges objects. Persist None as null so rediscovery clears old values.
    pub album_title: Option<String>,
    pub duration_ms: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MediaCandidate {
    pub metadata: Option<CandidateMetadata>,
    pub id: String,
    pub track_id: String,
    pub location: CandidateLocation,
    pub format: Option<String>,
    pub fidelity: Fidelity,
    pub discovered_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ResolvedLocation {
    Plugin {
        plugin_id: String,
        external_id: String,
    },
    Local {
        media_file_id: String,
        absolute_path: PathBuf,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedCandidate {
    pub id: String,
    pub track_id: String,
    pub location: ResolvedLocation,
    pub format: Option<String>,
    pub fidelity: Fidelity,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ResolveOutcome {
    Ready(ResolvedCandidate),
    Unavailable,
}

impl ResolveOutcome {
    pub fn ready(self) -> Option<ResolvedCandidate> {
        match self {
            ResolveOutcome::Ready(candidate) => Some(candidate),
            ResolveOutcome::Unavailable => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CandidateRecord {
    #[serde(skip_serializing_if = "Option::is_none")]
    metadata: Option<CandidateMetadata>,
    id: String,
    account_id: String,
    track_id: String,
    kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    plugin_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    external_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    media_file_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    format: Option<String>,
    lossless: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    bitrate_kbps: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    sample_rate_hz: Option<u32>,
    discovered_at: String,
    revision: u64,
    updated_by: String,
    updated_at: String,
}

#[derive(Clone)]
pub struct CandidateRepository {
    store: Store,
    mutation: Arc<Mutex<()>>,
}

impl CandidateRepository {
    pub fn new(store: Store) -> Self {
        CandidateRepository {
            store,
            mutation: Arc::new(Mutex::new(())),
        }
    }

    pub fn ensure_plugin(
        &self,
        account: &AccountId,
        track_id: &str,
        input: PluginCandidateInput,
        metadata: CandidateMetadata,
        updated_by: &str,
    ) -> Result<MediaCandidate, CandidateError> {
        self.ensure_plugins(
            account,
            vec![(track_id.into(), input, metadata)],
            updated_by,
        )
        .map(|mut candidates| candidates.remove(0))
    }

    pub fn ensure_plugins(
        &self,
        account: &AccountId,
        inputs: Vec<(String, PluginCandidateInput, CandidateMetadata)>,
        updated_by: &str,
    ) -> Result<Vec<MediaCandidate>, CandidateError> {
        let _guard = self.mutation.lock().expect("candidate mutation poisoned");
        let existing = self.list(account)?;
        let mut created = Vec::new();
        let mut candidates = Vec::with_capacity(inputs.len());
        for (track_id, input, metadata) in inputs {
            if let Some(candidate) = existing.iter().find(|candidate| {
                candidate.track_id == track_id
                    && matches!(
                        &candidate.location,
                        CandidateLocation::Plugin { plugin_id, external_id }
                            if plugin_id == &input.plugin_id && external_id == &input.external_id
                    )
            }) {
                let mut candidate = candidate.clone();
                if candidate.metadata.as_ref() != Some(&metadata) {
                    candidate.metadata = Some(metadata);
                    created.push((
                        candidate.id.clone(),
                        candidate_record(&candidate, updated_by),
                    ));
                }
                candidates.push(candidate);
                continue;
            }
            let candidate = MediaCandidate {
                metadata: Some(metadata),
                id: Ulid::new().to_string(),
                track_id,
                location: CandidateLocation::Plugin {
                    plugin_id: input.plugin_id,
                    external_id: input.external_id,
                },
                format: input.format,
                fidelity: input.fidelity,
                discovered_at: now(),
            };
            created.push((
                candidate.id.clone(),
                candidate_record(&candidate, updated_by),
            ));
            candidates.push(candidate);
        }
        self.store
            .put_batch(schema::TRACK_CANDIDATES, account, &created)?;
        Ok(candidates)
    }

    pub fn add_plugin(
        &self,
        account: &AccountId,
        track_id: &str,
        input: PluginCandidateInput,
        updated_by: &str,
    ) -> Result<MediaCandidate, CandidateError> {
        let candidate = MediaCandidate {
            metadata: None,
            id: Ulid::new().to_string(),
            track_id: track_id.into(),
            location: CandidateLocation::Plugin {
                plugin_id: input.plugin_id,
                external_id: input.external_id,
            },
            format: input.format,
            fidelity: input.fidelity,
            discovered_at: now(),
        };
        self.put(account, &candidate, updated_by)?;
        Ok(candidate)
    }

    pub fn add_local(
        &self,
        account: &AccountId,
        track_id: &str,
        media_file_id: String,
        format: Option<String>,
        fidelity: Fidelity,
        updated_by: &str,
    ) -> Result<MediaCandidate, CandidateError> {
        let candidate = MediaCandidate {
            metadata: None,
            id: Ulid::new().to_string(),
            track_id: track_id.into(),
            location: CandidateLocation::Local { media_file_id },
            format,
            fidelity,
            discovered_at: now(),
        };
        self.put(account, &candidate, updated_by)?;
        Ok(candidate)
    }

    pub fn resolve_id(
        &self,
        account: &AccountId,
        track_id: &str,
        candidate_id: &str,
        live_plugin_ids: &BTreeSet<String>,
        local: &LocalMediaStore,
    ) -> Result<ResolveOutcome, CandidateError> {
        let Some(record) =
            self.store
                .get::<CandidateRecord>(schema::TRACK_CANDIDATES, account, candidate_id)?
        else {
            return Ok(ResolveOutcome::Unavailable);
        };
        let candidate = MediaCandidate::try_from(record)?;
        if candidate.track_id != track_id {
            return Ok(ResolveOutcome::Unavailable);
        }
        resolve_candidate(candidate, account, live_plugin_ids, local)
    }

    pub fn resolve(
        &self,
        account: &AccountId,
        track_id: &str,
        live_plugin_ids: &BTreeSet<String>,
        local: &LocalMediaStore,
    ) -> Result<ResolveOutcome, CandidateError> {
        let mut candidates = self.list_for_track(account, track_id)?;
        let settings = crate::accounts::settings::read(&self.store, account)?;
        let priority = |candidate: &MediaCandidate| match &candidate.location {
            CandidateLocation::Plugin { plugin_id, .. } => settings
                .source_priority
                .iter()
                .position(|id| id == plugin_id)
                .unwrap_or(usize::MAX),
            CandidateLocation::Local { .. } => 0,
        };
        candidates.sort_by(|left, right| {
            right
                .fidelity
                .cmp(&left.fidelity)
                .then_with(|| is_local(right).cmp(&is_local(left)))
                .then_with(|| priority(left).cmp(&priority(right)))
                .then_with(|| right.id.cmp(&left.id))
        });

        for candidate in candidates {
            if let ResolveOutcome::Ready(candidate) =
                resolve_candidate(candidate, account, live_plugin_ids, local)?
            {
                return Ok(ResolveOutcome::Ready(candidate));
            }
        }

        Ok(ResolveOutcome::Unavailable)
    }

    pub(crate) fn best_local_fidelity(
        &self,
        account: &AccountId,
        track_id: &str,
        local: &LocalMediaStore,
    ) -> Result<Option<Fidelity>, CandidateError> {
        let mut best = None;
        for candidate in self.list_for_track(account, track_id)? {
            if let CandidateLocation::Local { media_file_id } = &candidate.location {
                if local.verified_exists(account, media_file_id)? {
                    best = Some(best.map_or(candidate.fidelity, |current: Fidelity| {
                        current.max(candidate.fidelity)
                    }));
                }
            }
        }
        Ok(best)
    }

    pub fn remove_for_media_files(
        &self,
        account: &AccountId,
        media_file_ids: &BTreeSet<String>,
    ) -> Result<(), CandidateError> {
        for candidate in self.list(account)? {
            if matches!(
                &candidate.location,
                CandidateLocation::Local { media_file_id } if media_file_ids.contains(media_file_id)
            ) {
                self.store
                    .delete(schema::TRACK_CANDIDATES, account, &candidate.id)?;
            }
        }
        Ok(())
    }

    fn list_for_track(
        &self,
        account: &AccountId,
        track_id: &str,
    ) -> Result<Vec<MediaCandidate>, CandidateError> {
        Ok(self
            .list(account)?
            .into_iter()
            .filter(|candidate| candidate.track_id == track_id)
            .collect())
    }

    fn list(&self, account: &AccountId) -> Result<Vec<MediaCandidate>, CandidateError> {
        self.store
            .list::<CandidateRecord>(schema::TRACK_CANDIDATES, account)?
            .into_iter()
            .map(MediaCandidate::try_from)
            .collect()
    }

    fn put(
        &self,
        account: &AccountId,
        candidate: &MediaCandidate,
        updated_by: &str,
    ) -> Result<(), CandidateError> {
        self.store.put(
            schema::TRACK_CANDIDATES,
            account,
            &candidate.id,
            &candidate_record(candidate, updated_by),
        )?;
        Ok(())
    }
}

fn resolve_candidate(
    candidate: MediaCandidate,
    account: &AccountId,
    live_plugin_ids: &BTreeSet<String>,
    local: &LocalMediaStore,
) -> Result<ResolveOutcome, CandidateError> {
    let location = match &candidate.location {
        CandidateLocation::Plugin {
            plugin_id,
            external_id,
        } if live_plugin_ids.contains(plugin_id) => ResolvedLocation::Plugin {
            plugin_id: plugin_id.clone(),
            external_id: external_id.clone(),
        },
        CandidateLocation::Plugin { .. } => return Ok(ResolveOutcome::Unavailable),
        CandidateLocation::Local { media_file_id } => {
            let Some(file) = local.ready(account, media_file_id)? else {
                return Ok(ResolveOutcome::Unavailable);
            };
            ResolvedLocation::Local {
                media_file_id: media_file_id.clone(),
                absolute_path: file.absolute_path,
            }
        }
    };
    Ok(ResolveOutcome::Ready(ResolvedCandidate {
        id: candidate.id,
        track_id: candidate.track_id,
        location,
        format: candidate.format,
        fidelity: candidate.fidelity,
    }))
}

fn candidate_record(candidate: &MediaCandidate, updated_by: &str) -> CandidateRecord {
    let (kind, plugin_id, external_id, media_file_id) = match &candidate.location {
        CandidateLocation::Plugin {
            plugin_id,
            external_id,
        } => (
            "plugin",
            Some(plugin_id.clone()),
            Some(external_id.clone()),
            None,
        ),
        CandidateLocation::Local { media_file_id } => {
            ("local", None, None, Some(media_file_id.clone()))
        }
    };
    CandidateRecord {
        metadata: candidate.metadata.clone(),
        id: candidate.id.clone(),
        account_id: String::new(),
        track_id: candidate.track_id.clone(),
        kind: kind.into(),
        plugin_id,
        external_id,
        media_file_id,
        format: candidate.format.clone(),
        lossless: candidate.fidelity.lossless,
        bitrate_kbps: candidate.fidelity.bitrate_kbps,
        sample_rate_hz: candidate.fidelity.sample_rate_hz,
        discovered_at: candidate.discovered_at.clone(),
        revision: 1,
        updated_by: updated_by.into(),
        updated_at: now(),
    }
}

impl TryFrom<CandidateRecord> for MediaCandidate {
    type Error = CandidateError;

    fn try_from(record: CandidateRecord) -> Result<Self, Self::Error> {
        let location = match record.kind.as_str() {
            "plugin" => CandidateLocation::Plugin {
                plugin_id: record.plugin_id.ok_or_else(invalid_candidate)?,
                external_id: record.external_id.ok_or_else(invalid_candidate)?,
            },
            "local" => CandidateLocation::Local {
                media_file_id: record.media_file_id.ok_or_else(invalid_candidate)?,
            },
            _ => return Err(invalid_candidate()),
        };
        Ok(MediaCandidate {
            metadata: record.metadata,
            id: record.id,
            track_id: record.track_id,
            location,
            format: record.format,
            fidelity: Fidelity {
                lossless: record.lossless,
                bitrate_kbps: record.bitrate_kbps,
                sample_rate_hz: record.sample_rate_hz,
            },
            discovered_at: record.discovered_at,
        })
    }
}

fn is_local(candidate: &MediaCandidate) -> bool {
    matches!(candidate.location, CandidateLocation::Local { .. })
}

fn invalid_candidate() -> CandidateError {
    CandidateError::Store(StoreError::Decode {
        collection: schema::TRACK_CANDIDATES.into(),
        message: "candidate location fields do not match kind".into(),
    })
}

fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Nanos, true)
}
