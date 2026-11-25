//! RPC-facing source search across third-party plugins.

use std::collections::HashSet;

use serde::Deserialize;

use crate::accounts::AuthContext;
use crate::media::{CandidateMetadata, Fidelity, Media, PluginCandidateInput};
use crate::plugin_credentials::{CredentialError, CredentialVault};
use crate::plugins::host::{PluginCallError, PluginHost};
use crate::plugins::registry::PluginStatus;
use crate::rpc::contract::{RpcSearchKind, RpcSearchPage};
use crate::source_cursors::SourceCursors;

const MAX_ALBUM_RESULTS: usize = 1_000;
const MAX_ARTIST_RESULTS: usize = 1_000;
const MAX_ALBUM_TRACKS: usize = 1_000;
const MAX_METADATA_CHARS: usize = 4_096;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SearchTrack {
    pub id: String,
    /// The source's own reference for this recording, kept so a client can seed a station
    /// from it. The core's `id` is account-scoped and means nothing to the plugin.
    pub external_id: String,
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
        pages: Vec<RpcSearchPage>,
    },
    InvalidCursor,
    NoSources,
}

#[derive(Debug, thiserror::Error)]
pub enum SourceCatalogError {
    #[error(transparent)]
    CursorSeal(#[from] crate::source_cursors::CursorSealError),
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
    cursor: Option<String>,
    tracks: Vec<PluginSearchTrack>,
}

enum PluginSearchPage {
    Tracks(PluginSearchOutput),
    Albums(PluginAlbumSearchOutput),
    Artists(PluginArtistSearchOutput),
}

/// One recording as a source plugin reports it.
///
/// Search results and station batches are the same wire shape on purpose: a track is a track
/// whatever surface produced it, and sharing the shape is what stops radio from growing its
/// own parallel notion of a recording.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct PluginSearchTrack {
    #[serde(rename = "source")]
    _source: String,
    pub(crate) external_id: String,
    pub(crate) title: String,
    pub(crate) artist: String,
    pub(crate) album: Option<String>,
    pub(crate) album_external_id: Option<String>,
    pub(crate) duration_ms: Option<u32>,
    pub(crate) artwork_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PluginArtistSearchOutput {
    cursor: Option<String>,
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
    cursor: Option<String>,
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
    cursors: SourceCursors,
}

impl SourceCatalog {
    pub fn new(plugins: PluginHost, media: Media, credentials: CredentialVault) -> Self {
        SourceCatalog {
            plugins,
            media,
            cursors: credentials.source_cursors(),
            credentials,
        }
    }

    pub fn search(
        &self,
        auth: &AuthContext,
        query: &str,
        limit: u32,
        page: Option<&RpcSearchPage>,
    ) -> Result<SearchOutcome, SourceCatalogError> {
        let selectors = serde_json::json!({ "query": query });
        let continuation = if let Some(page) = page {
            let scope = self.cursors.bind(
                &auth.account_id,
                &page.plugin_id,
                page.kind.operation(),
                &selectors,
            );
            let Some(continuation) = scope.open(&page.cursor) else {
                return Ok(SearchOutcome::InvalidCursor);
            };
            Some(continuation)
        } else {
            None
        };
        let sources: Vec<_> = self
            .plugins
            .list()
            .into_iter()
            .filter(|plugin| {
                page.is_none_or(|page| page.plugin_id == plugin.id)
                    && plugin.status == PluginStatus::Live
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
        let mut pages = Vec::new();
        let bound = limit as usize;
        for source in sources {
            let config = self
                .credentials
                .get(&auth.account_id, &source.id)?
                .map(serde_json::Value::from);

            for kind in [
                RpcSearchKind::Tracks,
                RpcSearchKind::Albums,
                RpcSearchKind::Artists,
            ] {
                if page.is_some_and(|page| page.kind != kind) {
                    continue;
                }
                let operation = kind.operation();
                let mut input = selectors.clone();
                input["limit"] = limit.into();
                if let Some(cursor) = &continuation {
                    input["cursor"] = serde_json::json!(cursor);
                }
                let Some(output) =
                    self.search_kind(auth, &source.id, kind, input, config.clone(), &mut failures)
                else {
                    continue;
                };
                let next = match output {
                    PluginSearchPage::Tracks(output) => {
                        for track in output.tracks.into_iter().take(bound) {
                            tracks.push(register_source_track(
                                &self.media,
                                auth,
                                &source.id,
                                track,
                            )?);
                        }
                        output.cursor
                    }
                    PluginSearchPage::Albums(output) => {
                        if let Err(error) = validate_album_summaries(&output.albums) {
                            failures.push(invalid_search(&source.id, error));
                            continue;
                        }
                        albums.extend(
                            output
                                .albums
                                .into_iter()
                                .take(bound)
                                .map(|album| album.into_summary(&source.id)),
                        );
                        output.cursor
                    }
                    PluginSearchPage::Artists(output) => {
                        if let Err(error) = validate_artist_summaries(&output.artists) {
                            failures.push(invalid_search(&source.id, error));
                            continue;
                        }
                        artists.extend(output.artists.into_iter().take(bound).map(|artist| {
                            CatalogArtistSummary {
                                external_id: artist.external_id,
                                name: artist.name,
                                artwork_url: artist.artwork_url,
                                source_plugin_id: source.id.clone(),
                            }
                        }));
                        output.cursor
                    }
                };
                let scope = self
                    .cursors
                    .bind(&auth.account_id, &source.id, operation, &selectors);
                if let Some(cursor) = scope.seal(next)? {
                    pages.push(RpcSearchPage {
                        plugin_id: source.id.clone(),
                        kind,
                        cursor,
                    });
                }
            }
        }

        Ok(SearchOutcome::Ready {
            tracks,
            albums,
            artists,
            pages,
            failures,
        })
    }

    /// Asks one source for one kind of result. A source that does not implement the operation
    /// contributes nothing and reports nothing: refusing an unimplemented kind is a capability
    /// boundary, and calling it a failure would put an error beside every honest result.
    fn search_kind(
        &self,
        auth: &AuthContext,
        plugin_id: &str,
        kind: RpcSearchKind,
        input: serde_json::Value,
        config: Option<serde_json::Value>,
        failures: &mut Vec<SearchFailure>,
    ) -> Option<PluginSearchPage> {
        let output = match self.plugins.call_for_account(
            plugin_id,
            "source",
            kind.operation(),
            input,
            auth.account_id.as_str(),
            config,
        ) {
            Ok(output) => output,
            Err(error) => {
                if !unimplemented_operation(&error) {
                    failures.push(call_failure(plugin_id, "plugin.search", error));
                }
                return None;
            }
        };
        let decoded = match kind {
            RpcSearchKind::Tracks => serde_json::from_value(output).map(PluginSearchPage::Tracks),
            RpcSearchKind::Albums => serde_json::from_value(output).map(PluginSearchPage::Albums),
            RpcSearchKind::Artists => serde_json::from_value(output).map(PluginSearchPage::Artists),
        };
        match decoded {
            Ok(output) => Some(output),
            Err(error) => {
                failures.push(invalid_search(plugin_id, error));
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
            .map(|album| album.into_summary(plugin_id))
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
        validate_album(&album)?;
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
                        },
                        CandidateMetadata {
                            title: track.title.clone(),
                            artist: track.artist.clone(),
                            album_title: Some(album.title.clone()),
                            duration_ms: track.duration_ms,
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
                external_id: track.external_id,
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

impl RpcSearchKind {
    fn operation(self) -> &'static str {
        match self {
            Self::Tracks => "search",
            Self::Albums => "album.search",
            Self::Artists => "artist.search",
        }
    }
}

impl PluginAlbumSummary {
    fn into_summary(self, plugin_id: &str) -> CatalogAlbumSummary {
        CatalogAlbumSummary {
            external_id: self.external_id,
            title: self.title,
            artist: self.artist,
            year: self.year,
            artwork_url: self.artwork_url,
            source_plugin_id: plugin_id.into(),
        }
    }
}

fn invalid_search(plugin_id: &str, error: impl ToString) -> SearchFailure {
    SearchFailure {
        plugin_id: plugin_id.into(),
        code: "plugin.invalidSearch".into(),
        message: error.to_string(),
        retryable: false,
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

/// Makes one source recording playable and returns its core identity.
///
/// Registering a candidate is not saving. A candidate says "this recording can be played from
/// this source". Source discovery and radio both need
/// the first and must never do the second.
pub(crate) fn register_source_track(
    media: &Media,
    auth: &AuthContext,
    plugin_id: &str,
    track: PluginSearchTrack,
) -> Result<SearchTrack, SourceCatalogError> {
    let id = track_id(auth.account_id.as_str(), plugin_id, &track.external_id);
    let external_id = track.external_id;
    media.ensure_plugin_candidate(
        &auth.account_id,
        &id,
        PluginCandidateInput {
            plugin_id: plugin_id.into(),
            external_id: external_id.clone(),
            format: None,
            fidelity: Fidelity {
                lossless: false,
                bitrate_kbps: None,
                sample_rate_hz: None,
            },
        },
        CandidateMetadata {
            title: track.title.clone(),
            artist: track.artist.clone(),
            album_title: track.album.clone(),
            duration_ms: track.duration_ms,
        },
        auth.principal_id(),
    )?;
    Ok(SearchTrack {
        id,
        external_id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        album_external_id: track.album_external_id,
        duration_ms: track.duration_ms,
        track_number: None,
        artwork_url: track.artwork_url,
        source_plugin_id: plugin_id.into(),
    })
}

/// A plugin that does not implement an operation is stating a capability boundary, not
/// failing. Reporting it as a failure would put an error beside every honest result.
pub(crate) fn unimplemented_operation(error: &PluginCallError) -> bool {
    matches!(error, PluginCallError::Plugin { code, .. } if code == "capability.unknownOperation")
}

// A source can resolve a browse alias to its canonical album id.
fn validate_album(album: &PluginAlbum) -> Result<(), SourceCatalogError> {
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

pub(crate) fn valid_text(value: &str) -> bool {
    !value.trim().is_empty() && value.chars().count() <= MAX_METADATA_CHARS
}

pub(crate) fn valid_optional_text(value: &Option<String>) -> bool {
    value.as_deref().is_none_or(valid_text)
}

pub(crate) fn track_id(account_id: &str, plugin_id: &str, external_id: &str) -> String {
    let digest = blake3::hash(format!("{account_id}\0{plugin_id}\0{external_id}").as_bytes())
        .to_hex()
        .to_string();
    digest[..26].to_string()
}

pub(crate) fn call_failure(plugin_id: &str, code: &str, error: PluginCallError) -> SearchFailure {
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
        code: code.into(),
        message: error.to_string(),
        retryable,
    }
}
