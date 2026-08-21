//! RPC-facing source search across third-party plugins.

use serde::Deserialize;

use crate::accounts::AuthContext;
use crate::media::{Fidelity, Media, PluginCandidateInput};
use crate::plugins::host::{PluginCallError, PluginHost};
use crate::plugins::registry::PluginStatus;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SearchTrack {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub duration_ms: Option<u32>,
    pub artwork_url: Option<String>,
    pub source_plugin_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SearchFailure {
    pub plugin_id: String,
    pub code: String,
    pub message: String,
    pub retryable: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SearchOutcome {
    Ready {
        tracks: Vec<SearchTrack>,
        failures: Vec<SearchFailure>,
    },
    NoSources,
}

#[derive(Debug, thiserror::Error)]
pub enum SourceCatalogError {
    #[error(transparent)]
    Media(#[from] crate::media::MediaError),
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PluginSearchOutput {
    tracks: Vec<PluginSearchTrack>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PluginSearchTrack {
    #[serde(rename = "source")]
    _source: String,
    external_id: String,
    title: String,
    artist: String,
    album: Option<String>,
    duration_ms: Option<u32>,
    artwork_url: Option<String>,
}

#[derive(Clone)]
pub struct SourceCatalog {
    plugins: PluginHost,
    media: Media,
}

impl SourceCatalog {
    pub fn new(plugins: PluginHost, media: Media) -> Self {
        SourceCatalog { plugins, media }
    }

    pub fn search(
        &self,
        auth: &AuthContext,
        query: &str,
        limit: u32,
    ) -> Result<SearchOutcome, SourceCatalogError> {
        let sources: Vec<_> = self
            .plugins
            .list()
            .into_iter()
            .filter(|plugin| {
                plugin.status == PluginStatus::Live
                    && plugin
                        .capabilities
                        .iter()
                        .any(|capability| capability == "source")
            })
            .collect();
        if sources.is_empty() {
            return Ok(SearchOutcome::NoSources);
        }

        let mut tracks = Vec::new();
        let mut failures = Vec::new();
        for source in sources {
            let output = match self.plugins.call(
                &source.id,
                "source",
                "search",
                serde_json::json!({ "query": query, "limit": limit }),
            ) {
                Ok(output) => output,
                Err(error) => {
                    failures.push(call_failure(&source.id, error));
                    continue;
                }
            };
            let output: PluginSearchOutput = match serde_json::from_value(output) {
                Ok(output) => output,
                Err(error) => {
                    failures.push(SearchFailure {
                        plugin_id: source.id.clone(),
                        code: "plugin.invalidSearch".into(),
                        message: error.to_string(),
                        retryable: false,
                    });
                    continue;
                }
            };

            for track in output.tracks {
                let id = track_id(auth.account_id.as_str(), &source.id, &track.external_id);
                self.media.ensure_plugin_candidate(
                    &auth.account_id,
                    &id,
                    PluginCandidateInput {
                        plugin_id: source.id.clone(),
                        external_id: track.external_id,
                        format: None,
                        fidelity: Fidelity {
                            lossless: false,
                            bitrate_kbps: None,
                            sample_rate_hz: None,
                        },
                        source_priority: 0,
                    },
                    auth.principal_id(),
                )?;
                tracks.push(SearchTrack {
                    id,
                    title: track.title,
                    artist: track.artist,
                    album: track.album,
                    duration_ms: track.duration_ms,
                    artwork_url: track.artwork_url,
                    source_plugin_id: source.id.clone(),
                });
            }
        }

        Ok(SearchOutcome::Ready { tracks, failures })
    }
}

fn track_id(account_id: &str, plugin_id: &str, external_id: &str) -> String {
    let digest = blake3::hash(format!("{account_id}\0{plugin_id}\0{external_id}").as_bytes())
        .to_hex()
        .to_string();
    digest[..26].to_string()
}

fn call_failure(plugin_id: &str, error: PluginCallError) -> SearchFailure {
    let retryable = matches!(
        error,
        PluginCallError::Unavailable { .. }
            | PluginCallError::ProcessExited { .. }
            | PluginCallError::Timeout { .. }
            | PluginCallError::Plugin {
                retryable: true,
                ..
            }
    );
    SearchFailure {
        plugin_id: plugin_id.into(),
        code: "plugin.search".into(),
        message: error.to_string(),
        retryable,
    }
}
