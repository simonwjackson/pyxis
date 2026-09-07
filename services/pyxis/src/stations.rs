//! Stations: the one radio model every source implements.
//!
//! A seed is what you point at, a station is what a seed produces, and a station yields
//! bounded batches. Pandora station tokens and YouTube Music watch queues both reduce to that
//! shape, so no provider needs its own operation, RPC or client surface.
//!
//! This module answers "what comes next". It never plays anything. Playback authority stays
//! with the session's host device, so fetching recommendations can never start audio.

use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Deserialize;

use crate::accounts::AuthContext;
use crate::media::Media;
use crate::plugin_credentials::CredentialVault;
use crate::plugins::host::PluginHost;
use crate::plugins::protocol::StationSeedKind;
use crate::plugins::registry::PluginStatus;
use crate::source_catalog::{
    call_failure, register_source_track, unimplemented_operation, valid_optional_text, valid_text,
    PluginSearchTrack, SearchFailure, SearchTrack, SourceCatalogError,
};

/// A cursor is useless after this long. Bounding lifetime keeps a stale continuation from
/// resuming a station a user abandoned hours ago.
const CURSOR_TTL: Duration = Duration::from_secs(30 * 60);
/// Bounding the store keeps a client that opens many stations from growing core memory without
/// limit. The oldest cursor is evicted first.
const MAX_CURSORS: usize = 512;
const DEFAULT_BATCH_LIMIT: u32 = 25;
const MAX_BATCH_LIMIT: u32 = 100;
const MAX_STATION_RESULTS: usize = 1_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Station {
    pub external_id: String,
    pub name: String,
    pub artwork_url: Option<String>,
    pub source_plugin_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StationBatch {
    pub tracks: Vec<SearchTrack>,
    pub cursor: Option<String>,
    pub exhausted: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StationListOutcome {
    Ready {
        stations: Vec<Station>,
        failures: Vec<SearchFailure>,
    },
    NoSources,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StationCreateOutcome {
    Ready(Station),
    UnsupportedSeed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StationNextOutcome {
    Ready(StationBatch),
    UnknownStation,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PluginStationListOutput {
    stations: Vec<PluginStation>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PluginStationOutput {
    station: PluginStation,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PluginStation {
    external_id: String,
    name: String,
    artwork_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PluginStationBatch {
    tracks: Vec<PluginSearchTrack>,
    cursor: Option<String>,
    #[serde(default)]
    exhausted: bool,
}

/// What the core remembers about a continuation.
///
/// The plugin's own cursor never reaches a client. Handing out a core-issued token is what
/// lets the core check that a continuation is replayed by the same account, against the same
/// source and the same station, before it is honored.
#[derive(Debug, Clone)]
struct CursorEntry {
    account_id: String,
    plugin_id: String,
    station_id: String,
    plugin_cursor: String,
    issued_at: Instant,
}

#[derive(Default)]
struct CursorStore {
    entries: HashMap<String, CursorEntry>,
    order: VecDeque<String>,
}

#[derive(Clone)]
pub struct Stations {
    plugins: PluginHost,
    media: Media,
    credentials: CredentialVault,
    cursors: Arc<Mutex<CursorStore>>,
    sequence: Arc<AtomicU64>,
}

impl Stations {
    pub fn new(plugins: PluginHost, media: Media, credentials: CredentialVault) -> Self {
        Stations {
            plugins,
            media,
            credentials,
            cursors: Arc::new(Mutex::new(CursorStore::default())),
            sequence: Arc::new(AtomicU64::new(0)),
        }
    }

    pub fn list(&self, auth: &AuthContext) -> Result<StationListOutcome, SourceCatalogError> {
        self.gather(auth, "station.list", serde_json::json!({}))
    }

    pub fn search(
        &self,
        auth: &AuthContext,
        query: &str,
        limit: u32,
    ) -> Result<StationListOutcome, SourceCatalogError> {
        self.gather(
            auth,
            "station.search",
            serde_json::json!({ "query": query, "limit": limit }),
        )
    }

    /// Asks every live source the same question and keeps the answers beside each other.
    ///
    /// A source that does not implement the operation contributes nothing and reports nothing.
    /// A source that fails contributes a typed failure and does not remove another source's
    /// stations.
    fn gather(
        &self,
        auth: &AuthContext,
        operation: &str,
        input: serde_json::Value,
    ) -> Result<StationListOutcome, SourceCatalogError> {
        let sources = self.live_sources();
        if sources.is_empty() {
            return Ok(StationListOutcome::NoSources);
        }

        let mut stations = Vec::new();
        let mut failures = Vec::new();
        for source in sources {
            let config = self
                .credentials
                .get(&auth.account_id, &source)?
                .map(serde_json::Value::from);
            let output: Option<PluginStationListOutput> = match self.plugins.call_for_account(
                &source,
                "source",
                operation,
                input.clone(),
                auth.account_id.as_str(),
                config,
            ) {
                Ok(value) => match serde_json::from_value(value) {
                    Ok(output) => Some(output),
                    Err(error) => {
                        failures.push(SearchFailure {
                            plugin_id: source.clone(),
                            code: "plugin.invalidStation".into(),
                            message: error.to_string(),
                            retryable: false,
                        });
                        None
                    }
                },
                Err(error) => {
                    if !unimplemented_operation(&error) {
                        failures.push(call_failure(&source, "plugin.station", error));
                    }
                    None
                }
            };

            let Some(output) = output else { continue };
            match validate_stations(&output.stations) {
                Ok(()) => stations.extend(output.stations.into_iter().map(|station| Station {
                    external_id: station.external_id,
                    name: station.name,
                    artwork_url: station.artwork_url,
                    source_plugin_id: source.clone(),
                })),
                Err(error) => failures.push(SearchFailure {
                    plugin_id: source.clone(),
                    code: "plugin.invalidStation".into(),
                    message: error.to_string(),
                    retryable: false,
                }),
            }
        }

        Ok(StationListOutcome::Ready { stations, failures })
    }

    pub fn create(
        &self,
        auth: &AuthContext,
        plugin_id: &str,
        seed_kind: StationSeedKind,
        seed_external_id: &str,
    ) -> Result<StationCreateOutcome, SourceCatalogError> {
        // The declaration is checked before the call, so a source that never accepts this seed
        // is not asked at all. That is the point of declaring: no probing round trip.
        if !self.declares_seed(plugin_id, seed_kind) {
            return Ok(StationCreateOutcome::UnsupportedSeed);
        }
        let config = self
            .credentials
            .get(&auth.account_id, plugin_id)?
            .map(serde_json::Value::from);
        let value = match self.plugins.call_for_account(
            plugin_id,
            "source",
            "station.create",
            serde_json::json!({
                "seed": { "kind": seed_kind, "externalId": seed_external_id }
            }),
            auth.account_id.as_str(),
            config,
        ) {
            Ok(value) => value,
            Err(error) if unimplemented_operation(&error) => {
                return Ok(StationCreateOutcome::UnsupportedSeed)
            }
            Err(error) => return Err(error.into()),
        };
        let output: PluginStationOutput = serde_json::from_value(value)
            .map_err(|error| SourceCatalogError::InvalidOutput(error.to_string()))?;
        validate_stations(std::slice::from_ref(&output.station))?;
        Ok(StationCreateOutcome::Ready(Station {
            external_id: output.station.external_id,
            name: output.station.name,
            artwork_url: output.station.artwork_url,
            source_plugin_id: plugin_id.into(),
        }))
    }

    pub fn next(
        &self,
        auth: &AuthContext,
        plugin_id: &str,
        station_id: &str,
        cursor: Option<&str>,
        limit: Option<u32>,
    ) -> Result<StationNextOutcome, SourceCatalogError> {
        let plugin_cursor = match cursor {
            None => None,
            Some(token) => match self.resolve_cursor(auth, plugin_id, station_id, token) {
                Some(plugin_cursor) => Some(plugin_cursor),
                // A cursor that does not belong to this account, source and station is refused
                // exactly like one that never existed. Saying which of the three failed would
                // tell a caller about another account's state.
                None => return Ok(StationNextOutcome::UnknownStation),
            },
        };
        let bound = limit.unwrap_or(DEFAULT_BATCH_LIMIT).min(MAX_BATCH_LIMIT);
        let config = self
            .credentials
            .get(&auth.account_id, plugin_id)?
            .map(serde_json::Value::from);
        let mut input = serde_json::json!({ "stationId": station_id, "limit": bound });
        if let Some(plugin_cursor) = plugin_cursor {
            input["cursor"] = serde_json::Value::String(plugin_cursor);
        }
        let value = match self.plugins.call_for_account(
            plugin_id,
            "source",
            "station.next",
            input,
            auth.account_id.as_str(),
            config,
        ) {
            Ok(value) => value,
            // A source with no `station.next` cannot have produced this station either.
            Err(error) if unimplemented_operation(&error) => {
                return Ok(StationNextOutcome::UnknownStation)
            }
            Err(error) => return Err(error.into()),
        };
        let batch: PluginStationBatch = serde_json::from_value(value)
            .map_err(|error| SourceCatalogError::InvalidOutput(error.to_string()))?;

        let mut tracks = Vec::new();
        for track in batch.tracks.into_iter().take(bound as usize) {
            tracks.push(register_source_track(&self.media, auth, plugin_id, track)?);
        }
        let cursor = match batch.cursor {
            Some(plugin_cursor) if !plugin_cursor.trim().is_empty() => {
                Some(self.issue_cursor(auth, plugin_id, station_id, plugin_cursor))
            }
            _ => None,
        };
        Ok(StationNextOutcome::Ready(StationBatch {
            tracks,
            cursor,
            exhausted: batch.exhausted,
        }))
    }

    fn live_sources(&self) -> Vec<String> {
        self.plugins
            .list()
            .into_iter()
            .filter(|plugin| {
                plugin.status == PluginStatus::Live
                    && plugin
                        .capabilities
                        .iter()
                        .any(|capability| capability == "source")
            })
            .map(|plugin| plugin.id)
            .collect()
    }

    fn declares_seed(&self, plugin_id: &str, seed_kind: StationSeedKind) -> bool {
        self.plugins.list().into_iter().any(|plugin| {
            plugin.id == plugin_id
                && plugin.status == PluginStatus::Live
                && plugin.station_seed_kinds.contains(&seed_kind)
        })
    }

    fn issue_cursor(
        &self,
        auth: &AuthContext,
        plugin_id: &str,
        station_id: &str,
        plugin_cursor: String,
    ) -> String {
        let sequence = self.sequence.fetch_add(1, Ordering::Relaxed);
        let token = blake3::hash(
            format!(
                "{}\0{plugin_id}\0{station_id}\0{plugin_cursor}\0{sequence}",
                auth.account_id.as_str()
            )
            .as_bytes(),
        )
        .to_hex()
        .to_string()[..32]
            .to_string();

        let mut store = self.cursors.lock().expect("cursor store");
        store.entries.insert(
            token.clone(),
            CursorEntry {
                account_id: auth.account_id.as_str().to_string(),
                plugin_id: plugin_id.into(),
                station_id: station_id.into(),
                plugin_cursor,
                issued_at: Instant::now(),
            },
        );
        store.order.push_back(token.clone());
        while store.order.len() > MAX_CURSORS {
            if let Some(oldest) = store.order.pop_front() {
                store.entries.remove(&oldest);
            }
        }
        token
    }

    fn resolve_cursor(
        &self,
        auth: &AuthContext,
        plugin_id: &str,
        station_id: &str,
        token: &str,
    ) -> Option<String> {
        let store = self.cursors.lock().expect("cursor store");
        let entry = store.entries.get(token)?;
        if entry.account_id != auth.account_id.as_str()
            || entry.plugin_id != plugin_id
            || entry.station_id != station_id
            || entry.issued_at.elapsed() > CURSOR_TTL
        {
            return None;
        }
        Some(entry.plugin_cursor.clone())
    }
}

fn validate_stations(stations: &[PluginStation]) -> Result<(), SourceCatalogError> {
    if stations.len() > MAX_STATION_RESULTS {
        return Err(SourceCatalogError::InvalidOutput(format!(
            "station list returned {} results; maximum is {MAX_STATION_RESULTS}",
            stations.len()
        )));
    }
    for station in stations {
        if !valid_text(&station.external_id)
            || !valid_text(&station.name)
            || !valid_optional_text(&station.artwork_url)
        {
            return Err(SourceCatalogError::InvalidOutput(
                "stations require non-empty externalId and name".into(),
            ));
        }
    }
    Ok(())
}
