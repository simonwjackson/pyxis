//! RPC-facing source search across third-party plugins.

use serde::Deserialize;

use crate::accounts::AuthContext;
use crate::media::{Fidelity, Media, PluginCandidateInput};
use crate::plugin_credentials::{CredentialError, CredentialVault};
use crate::plugins::host::{PluginCallError, PluginHost};
use crate::plugins::registry::PluginStatus;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SearchTrack {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub duration_ms: Option<u32>,
    pub track_number: Option<u32>,
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
pub struct CatalogAlbumSummary {
    pub external_id: String,
    pub title: String,
    pub artist: String,
    pub year: Option<u32>,
    pub artwork_url: Option<String>,
    pub source_plugin_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CatalogAlbum {
    pub external_id: String,
    pub title: String,
    pub artist: String,
    pub year: Option<u32>,
    pub artwork_url: Option<String>,
    pub source_plugin_id: String,
    pub tracks: Vec<SearchTrack>,
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
    #[error(transparent)]
    Credentials(#[from] CredentialError),
    #[error("source plugin call failed: {0}")]
    Plugin(String),
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PluginAlbumSearchOutput {
    albums: Vec<PluginAlbumSummary>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PluginAlbumSummary {
    external_id: String,
    title: String,
    artist: String,
    year: Option<u32>,
    artwork_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PluginAlbum {
    external_id: String,
    title: String,
    artist: String,
    year: Option<u32>,
    artwork_url: Option<String>,
    tracks: Vec<PluginAlbumTrack>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PluginAlbumTrack {
    external_id: String,
    title: String,
    artist: String,
    duration_ms: Option<u32>,
    track_number: u32,
}

#[derive(Clone)]
pub struct SourceCatalog {
    plugins: PluginHost,
    media: Media,
    credentials: CredentialVault,
}

impl SourceCatalog {
    pub fn new(plugins: PluginHost, media: Media, credentials: CredentialVault) -> Self {
        SourceCatalog {
            plugins,
            media,
            credentials,
        }
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
            let config = self
                .credentials
                .get(&auth.account_id, &source.id)?
                .map(serde_json::Value::from);
            let output = match self.plugins.call_for_account(
                &source.id,
                "source",
                "search",
                serde_json::json!({ "query": query, "limit": limit }),
                auth.account_id.as_str(),
                config,
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
                    track_number: None,
                    artwork_url: track.artwork_url,
                    source_plugin_id: source.id.clone(),
                });
            }
        }

        Ok(SearchOutcome::Ready { tracks, failures })
    }

    pub fn search_albums(
        &self,
        auth: &AuthContext,
        plugin_id: &str,
        query: &str,
    ) -> Result<Vec<CatalogAlbumSummary>, SourceCatalogError> {
        let config = self
            .credentials
            .get(&auth.account_id, plugin_id)?
            .map(serde_json::Value::from);
        let value = self
            .plugins
            .call_for_account(
                plugin_id,
                "source",
                "album.search",
                serde_json::json!({ "query": query }),
                auth.account_id.as_str(),
                config,
            )
            .map_err(|error| SourceCatalogError::Plugin(error.to_string()))?;
        let output: PluginAlbumSearchOutput = serde_json::from_value(value)
            .map_err(|error| SourceCatalogError::Plugin(error.to_string()))?;
        Ok(output
            .albums
            .into_iter()
            .map(|album| CatalogAlbumSummary {
                external_id: album.external_id,
                title: album.title,
                artist: album.artist,
                year: album.year,
                artwork_url: album.artwork_url,
                source_plugin_id: plugin_id.into(),
            })
            .collect())
    }

    pub fn get_album(
        &self,
        auth: &AuthContext,
        plugin_id: &str,
        external_id: &str,
    ) -> Result<CatalogAlbum, SourceCatalogError> {
        let config = self
            .credentials
            .get(&auth.account_id, plugin_id)?
            .map(serde_json::Value::from);
        let value = self
            .plugins
            .call_for_account(
                plugin_id,
                "source",
                "album.get",
                serde_json::json!({ "externalId": external_id }),
                auth.account_id.as_str(),
                config,
            )
            .map_err(|error| SourceCatalogError::Plugin(error.to_string()))?;
        let album: PluginAlbum = serde_json::from_value(value)
            .map_err(|error| SourceCatalogError::Plugin(error.to_string()))?;
        let mut tracks = Vec::new();
        for track in album.tracks {
            let id = track_id(auth.account_id.as_str(), plugin_id, &track.external_id);
            self.media.ensure_plugin_candidate(
                &auth.account_id,
                &id,
                PluginCandidateInput {
                    plugin_id: plugin_id.into(),
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
                album: Some(album.title.clone()),
                duration_ms: track.duration_ms,
                track_number: Some(track.track_number),
                artwork_url: album.artwork_url.clone(),
                source_plugin_id: plugin_id.into(),
            });
        }
        Ok(CatalogAlbum {
            external_id: album.external_id,
            title: album.title,
            artist: album.artist,
            year: album.year,
            artwork_url: album.artwork_url,
            source_plugin_id: plugin_id.into(),
            tracks,
        })
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
