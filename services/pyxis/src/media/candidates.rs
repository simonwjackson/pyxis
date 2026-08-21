//! Playable candidates and quality-first resolution.

use std::cmp::Ordering;
use std::collections::BTreeSet;
use std::path::PathBuf;

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
    /// Higher wins, but only after fidelity and locality are equal.
    pub source_priority: i32,
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MediaCandidate {
    pub id: String,
    pub track_id: String,
    pub location: CandidateLocation,
    pub format: Option<String>,
    pub fidelity: Fidelity,
    pub source_priority: i32,
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
    source_priority: i32,
    discovered_at: String,
    revision: u64,
    updated_by: String,
    updated_at: String,
}

#[derive(Clone)]
pub struct CandidateRepository {
    store: Store,
}

impl CandidateRepository {
    pub fn new(store: Store) -> Self {
        CandidateRepository { store }
    }

    pub fn ensure_plugin(
        &self,
        account: &AccountId,
        track_id: &str,
        input: PluginCandidateInput,
        updated_by: &str,
    ) -> Result<MediaCandidate, CandidateError> {
        if let Some(existing) =
            self.list_for_track(account, track_id)?
                .into_iter()
                .find(|candidate| {
                    matches!(
                        &candidate.location,
                        CandidateLocation::Plugin { plugin_id, external_id }
                            if plugin_id == &input.plugin_id && external_id == &input.external_id
                    )
                })
        {
            return Ok(existing);
        }
        self.add_plugin(account, track_id, input, updated_by)
    }

    pub fn add_plugin(
        &self,
        account: &AccountId,
        track_id: &str,
        input: PluginCandidateInput,
        updated_by: &str,
    ) -> Result<MediaCandidate, CandidateError> {
        let candidate = MediaCandidate {
            id: Ulid::new().to_string(),
            track_id: track_id.into(),
            location: CandidateLocation::Plugin {
                plugin_id: input.plugin_id,
                external_id: input.external_id,
            },
            format: input.format,
            fidelity: input.fidelity,
            source_priority: input.source_priority,
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
            id: Ulid::new().to_string(),
            track_id: track_id.into(),
            location: CandidateLocation::Local { media_file_id },
            format,
            fidelity,
            source_priority: 0,
            discovered_at: now(),
        };
        self.put(account, &candidate, updated_by)?;
        Ok(candidate)
    }

    pub fn resolve(
        &self,
        account: &AccountId,
        track_id: &str,
        live_plugin_ids: &BTreeSet<String>,
        local: &LocalMediaStore,
    ) -> Result<ResolveOutcome, CandidateError> {
        let mut candidates = self.list_for_track(account, track_id)?;
        candidates.sort_by(|left, right| compare(right, left));

        for candidate in candidates {
            let location = match &candidate.location {
                CandidateLocation::Plugin {
                    plugin_id,
                    external_id,
                } if live_plugin_ids.contains(plugin_id) => ResolvedLocation::Plugin {
                    plugin_id: plugin_id.clone(),
                    external_id: external_id.clone(),
                },
                CandidateLocation::Plugin { .. } => continue,
                CandidateLocation::Local { media_file_id } => {
                    let Some(file) = local.ready(account, media_file_id)? else {
                        continue;
                    };
                    ResolvedLocation::Local {
                        media_file_id: media_file_id.clone(),
                        absolute_path: file.absolute_path,
                    }
                }
            };
            return Ok(ResolveOutcome::Ready(ResolvedCandidate {
                id: candidate.id,
                track_id: candidate.track_id,
                location,
                format: candidate.format,
                fidelity: candidate.fidelity,
            }));
        }

        Ok(ResolveOutcome::Unavailable)
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
        let record = CandidateRecord {
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
            source_priority: candidate.source_priority,
            discovered_at: candidate.discovered_at.clone(),
            revision: 1,
            updated_by: updated_by.into(),
            updated_at: now(),
        };
        self.store
            .put(schema::TRACK_CANDIDATES, account, &candidate.id, &record)?;
        Ok(())
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
            id: record.id,
            track_id: record.track_id,
            location,
            format: record.format,
            fidelity: Fidelity {
                lossless: record.lossless,
                bitrate_kbps: record.bitrate_kbps,
                sample_rate_hz: record.sample_rate_hz,
            },
            source_priority: record.source_priority,
            discovered_at: record.discovered_at,
        })
    }
}

fn compare(left: &MediaCandidate, right: &MediaCandidate) -> Ordering {
    left.fidelity
        .cmp(&right.fidelity)
        .then_with(|| is_local(left).cmp(&is_local(right)))
        .then_with(|| left.source_priority.cmp(&right.source_priority))
        .then_with(|| left.id.cmp(&right.id))
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
