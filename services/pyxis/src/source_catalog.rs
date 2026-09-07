//! RPC-facing source search across third-party plugins.

use std::collections::HashSet;

use serde::Deserialize;

use crate::accounts::AuthContext;
use crate::media::{Fidelity, Media, PluginCandidateInput};
use crate::plugin_credentials::{CredentialError, CredentialVault};
use crate::plugins::host::{PluginCallError, PluginHost};
use crate::plugins::registry::PluginStatus;

const MAX_ALBUM_RESULTS: usize = 1_000;
const MAX_ARTIST_RESULTS: usize = 1_000;
const MAX_ALBUM_TRACKS: usize = 1_000;
const MAX_METADATA_CHARS: usize = 4_096;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SearchTrack {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub album_external_id: Option<String>,
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
pub struct CatalogArtistSummary {
    pub external_id: String,
    pub name: String,
    pub artwork_url: Option<String>,
    pub source_plugin_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SearchOutcome {
    Ready {
        tracks: Vec<SearchTrack>,
        albums: Vec<CatalogAlbumSummary>,
        artists: Vec<CatalogArtistSummary>,
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
    #[error(transparent)]
    Plugin(#[from] PluginCallError),
    #[error("source plugin returned invalid album data: {0}")]
    InvalidOutput(String),
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
    album_external_id: Option<String>,
    duration_ms: Option<u32>,
    artwork_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PluginArtistSearchOutput {
    artists: Vec<PluginArtistSummary>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PluginArtistSummary {
    external_id: String,
    name: String,
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
        let mut albums = Vec::new();
        let mut artists = Vec::new();
        let mut failures = Vec::new();
        let bound = limit as usize;
        for source in sources {
            let config = self
                .credentials
                .get(&auth.account_id, &source.id)?
                .map(serde_json::Value::from);

            let songs: Option<PluginSearchOutput> = self.search_kind(
                auth,
                &source.id,
                "search",
                serde_json::json!({ "query": query, "limit": limit }),
                config.clone(),
                &mut failures,
            );
            if let Some(songs) = songs {
                for track in songs.tracks.into_iter().take(bound) {
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
                        album_external_id: track.album_external_id,
                        duration_ms: track.duration_ms,
                        track_number: None,
                        artwork_url: track.artwork_url,
                        source_plugin_id: source.id.clone(),
                    });
                }
            }

            let found: Option<PluginAlbumSearchOutput> = self.search_kind(
                auth,
                &source.id,
                "album.search",
                serde_json::json!({ "query": query }),
                config.clone(),
                &mut failures,
            );
            if let Some(found) = found {
                match validate_album_summaries(&found.albums) {
                    Ok(()) => albums.extend(found.albums.into_iter().take(bound).map(|album| {
                        CatalogAlbumSummary {
                            external_id: album.external_id,
                            title: album.title,
                            artist: album.artist,
                            year: album.year,
                            artwork_url: album.artwork_url,
                            source_plugin_id: source.id.clone(),
                        }
                    })),
                    Err(error) => failures.push(SearchFailure {
                        plugin_id: source.id.clone(),
                        code: "plugin.invalidSearch".into(),
                        message: error.to_string(),
                        retryable: false,
                    }),
                }
            }

            let found: Option<PluginArtistSearchOutput> = self.search_kind(
                auth,
                &source.id,
                "artist.search",
                serde_json::json!({ "query": query, "limit": limit }),
                config,
                &mut failures,
            );
            if let Some(found) = found {
                match validate_artist_summaries(&found.artists) {
                    Ok(()) => artists.extend(found.artists.into_iter().take(bound).map(|artist| {
                        CatalogArtistSummary {
                            external_id: artist.external_id,
                            name: artist.name,
                            artwork_url: artist.artwork_url,
                            source_plugin_id: source.id.clone(),
                        }
                    })),
                    Err(error) => failures.push(SearchFailure {
                        plugin_id: source.id.clone(),
                        code: "plugin.invalidSearch".into(),
                        message: error.to_string(),
                        retryable: false,
                    }),
                }
            }
        }

        Ok(SearchOutcome::Ready {
            tracks,
            albums,
            artists,
            failures,
        })
    }

    /// Asks one source for one kind of result. A source that does not implement the operation
    /// contributes nothing and reports nothing: refusing an unimplemented kind is a capability
    /// boundary, and calling it a failure would put an error beside every honest result.
    fn search_kind<T: serde::de::DeserializeOwned>(
        &self,
        auth: &AuthContext,
        plugin_id: &str,
        operation: &str,
        input: serde_json::Value,
        config: Option<serde_json::Value>,
        failures: &mut Vec<SearchFailure>,
    ) -> Option<T> {
        let output = match self.plugins.call_for_account(
            plugin_id,
            "source",
            operation,
            input,
            auth.account_id.as_str(),
            config,
        ) {
            Ok(output) => output,
            Err(error) => {
                if !unimplemented_operation(&error) {
                    failures.push(call_failure(plugin_id, error));
                }
                return None;
            }
        };
        match serde_json::from_value(output) {
            Ok(output) => Some(output),
            Err(error) => {
                failures.push(SearchFailure {
                    plugin_id: plugin_id.into(),
                    code: "plugin.invalidSearch".into(),
                    message: error.to_string(),
                    retryable: false,
                });
                None
            }
        }
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
        let value = self.plugins.call_for_account(
            plugin_id,
            "source",
            "album.search",
            serde_json::json!({ "query": query }),
            auth.account_id.as_str(),
            config,
        )?;
        let output: PluginAlbumSearchOutput = serde_json::from_value(value)
            .map_err(|error| SourceCatalogError::InvalidOutput(error.to_string()))?;
        validate_album_summaries(&output.albums)?;
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
        let value = self.plugins.call_for_account(
            plugin_id,
            "source",
            "album.get",
            serde_json::json!({ "externalId": external_id }),
            auth.account_id.as_str(),
            config,
        )?;
        let album: PluginAlbum = serde_json::from_value(value)
            .map_err(|error| SourceCatalogError::InvalidOutput(error.to_string()))?;
        validate_album(&album, external_id)?;
        self.media.ensure_plugin_candidates(
            &auth.account_id,
            album
                .tracks
                .iter()
                .map(|track| {
                    (
                        track_id(auth.account_id.as_str(), plugin_id, &track.external_id),
                        PluginCandidateInput {
                            plugin_id: plugin_id.into(),
                            external_id: track.external_id.clone(),
                            format: None,
                            fidelity: Fidelity {
                                lossless: false,
                                bitrate_kbps: None,
                                sample_rate_hz: None,
                            },
                            source_priority: 0,
                        },
                    )
                })
                .collect(),
            auth.principal_id(),
        )?;
        let tracks = album
            .tracks
            .into_iter()
            .map(|track| SearchTrack {
                id: track_id(auth.account_id.as_str(), plugin_id, &track.external_id),
                title: track.title,
                artist: track.artist,
                album: Some(album.title.clone()),
                album_external_id: Some(album.external_id.clone()),
                duration_ms: track.duration_ms,
                track_number: Some(track.track_number),
                artwork_url: album.artwork_url.clone(),
                source_plugin_id: plugin_id.into(),
            })
            .collect();
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

fn validate_album_summaries(albums: &[PluginAlbumSummary]) -> Result<(), SourceCatalogError> {
    if albums.len() > MAX_ALBUM_RESULTS {
        return Err(SourceCatalogError::InvalidOutput(format!(
            "album search returned {} results; maximum is {MAX_ALBUM_RESULTS}",
            albums.len()
        )));
    }
    for album in albums {
        if !valid_text(&album.external_id)
            || !valid_text(&album.title)
            || !valid_text(&album.artist)
            || !valid_optional_text(&album.artwork_url)
        {
            return Err(SourceCatalogError::InvalidOutput(
                "album summaries require non-empty externalId, title, and artist".into(),
            ));
        }
    }
    Ok(())
}

fn validate_artist_summaries(artists: &[PluginArtistSummary]) -> Result<(), SourceCatalogError> {
    if artists.len() > MAX_ARTIST_RESULTS {
        return Err(SourceCatalogError::InvalidOutput(format!(
            "artist search returned {} results; maximum is {MAX_ARTIST_RESULTS}",
            artists.len()
        )));
    }
    for artist in artists {
        if !valid_text(&artist.external_id)
            || !valid_text(&artist.name)
            || !valid_optional_text(&artist.artwork_url)
        {
            return Err(SourceCatalogError::InvalidOutput(
                "artist summaries require non-empty externalId and name".into(),
            ));
        }
    }
    Ok(())
}

fn unimplemented_operation(error: &PluginCallError) -> bool {
    matches!(error, PluginCallError::Plugin { code, .. } if code == "capability.unknownOperation")
}

fn validate_album(album: &PluginAlbum, requested_id: &str) -> Result<(), SourceCatalogError> {
    if album.external_id != requested_id {
        return Err(SourceCatalogError::InvalidOutput(format!(
            "album externalId '{}' did not match requested id '{requested_id}'",
            album.external_id
        )));
    }
    if !valid_text(&album.external_id)
        || !valid_text(&album.title)
        || !valid_text(&album.artist)
        || !valid_optional_text(&album.artwork_url)
        || album.tracks.is_empty()
    {
        return Err(SourceCatalogError::InvalidOutput(
            "album requires non-empty title, artist, and tracks".into(),
        ));
    }
    if album.tracks.len() > MAX_ALBUM_TRACKS {
        return Err(SourceCatalogError::InvalidOutput(format!(
            "album returned {} tracks; maximum is {MAX_ALBUM_TRACKS}",
            album.tracks.len()
        )));
    }
    let mut track_ids = HashSet::new();
    for track in &album.tracks {
        if !valid_text(&track.external_id)
            || !valid_text(&track.title)
            || !valid_text(&track.artist)
        {
            return Err(SourceCatalogError::InvalidOutput(
                "album tracks require non-empty externalId, title, and artist".into(),
            ));
        }
        if track.track_number == 0 {
            return Err(SourceCatalogError::InvalidOutput(
                "album trackNumber must be at least 1".into(),
            ));
        }
        if !track_ids.insert(&track.external_id) {
            return Err(SourceCatalogError::InvalidOutput(format!(
                "album contains duplicate track externalId '{}'",
                track.external_id
            )));
        }
    }
    Ok(())
}

fn valid_text(value: &str) -> bool {
    !value.trim().is_empty() && value.chars().count() <= MAX_METADATA_CHARS
}

fn valid_optional_text(value: &Option<String>) -> bool {
    value.as_deref().is_none_or(valid_text)
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
