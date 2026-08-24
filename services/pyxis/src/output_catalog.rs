use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};

use reqwest::Url;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::accounts::AuthContext;
use crate::library::{Library, LibraryError};
use crate::media::{Media, MediaError, ResolveOutcome};
use crate::plugin_credentials::{CredentialError, CredentialVault};
use crate::plugins::host::{PluginCallError, PluginHost};
use crate::sessions::{OutputBinding, Session, SessionCommand, Transport};
use crate::stream::OutputStreamTokens;

#[derive(Debug, thiserror::Error)]
pub enum OutputError {
    #[error(transparent)]
    Plugin(#[from] PluginCallError),
    #[error(transparent)]
    Credentials(#[from] CredentialError),
    #[error(transparent)]
    Library(#[from] LibraryError),
    #[error(transparent)]
    Media(#[from] MediaError),
    #[error("output plugin returned invalid data: {0}")]
    InvalidOutput(String),
    #[error("output target '{0}' does not exist")]
    UnknownTarget(String),
    #[error("output target is already owned by account '{0}'")]
    TargetInUse(String),
    #[error("the renderer is no longer playing this output session's stream")]
    RendererOwnershipLost,
    #[error("PYXIS_LAN_BASE_URL must be an absolute LAN HTTP URL before an output can play")]
    LanUrlRequired,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OutputRoom {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    pub address: String,
    pub location_url: String,
    pub coordinator: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OutputGroup {
    pub id: String,
    pub coordinator_id: String,
    pub coordinator_name: String,
    pub rooms: Vec<OutputRoom>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OutputTopology {
    pub groups: Vec<OutputGroup>,
    pub refreshed_at: u64,
    pub authoritative: bool,
}

impl OutputTopology {
    pub fn target_ids(&self) -> impl Iterator<Item = String> + '_ {
        self.groups
            .iter()
            .flat_map(|group| group.rooms.iter().map(|room| room.id.clone()))
    }

    pub fn contains(&self, target_id: &str) -> bool {
        self.groups
            .iter()
            .any(|group| group.rooms.iter().any(|room| room.id == target_id))
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct OutputEffect {
    pub physical: bool,
    pub commit_position_ms: Option<u64>,
    pub commit_duration_ms: Option<u64>,
    pub rollback_transport: Option<Transport>,
    pub rollback_position_ms: Option<u64>,
    pub rollback_duration_ms: Option<u64>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OutputTransportState {
    pub state: String,
    #[serde(default)]
    pub position_ms: Option<u64>,
    #[serde(default)]
    pub duration_ms: Option<u64>,
    #[serde(default)]
    pub stream_url: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct OutputStreamProfile {
    preferred_formats: Vec<String>,
}

#[derive(Clone)]
pub struct OutputCatalog {
    plugins: PluginHost,
    credentials: CredentialVault,
    library: Library,
    media: Media,
    stream_tokens: OutputStreamTokens,
    lan_base_url: Option<Url>,
    target_locks: Arc<Mutex<HashMap<String, Arc<Mutex<()>>>>>,
    plugin_locks: Arc<Mutex<HashMap<String, Arc<Mutex<()>>>>>,
    target_owners: Arc<Mutex<HashMap<String, String>>>,
    active_streams: Arc<Mutex<HashMap<String, (String, String)>>>,
}

impl OutputCatalog {
    pub fn new(
        plugins: PluginHost,
        credentials: CredentialVault,
        library: Library,
        media: Media,
        stream_tokens: OutputStreamTokens,
        lan_base_url: Option<String>,
    ) -> Self {
        let lan_base_url = lan_base_url
            .and_then(|value| Url::parse(&value).ok())
            .filter(|url| {
                url.scheme() == "http"
                    && url.host_str().is_some()
                    && url.path() == "/"
                    && url.query().is_none()
                    && url.fragment().is_none()
            });
        OutputCatalog {
            plugins,
            credentials,
            library,
            media,
            stream_tokens,
            lan_base_url,
            target_locks: Arc::new(Mutex::new(HashMap::new())),
            plugin_locks: Arc::new(Mutex::new(HashMap::new())),
            target_owners: Arc::new(Mutex::new(HashMap::new())),
            active_streams: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn serialize_plugin<T>(&self, plugin_id: &str, operation: impl FnOnce() -> T) -> T {
        let lock = self
            .plugin_locks
            .lock()
            .expect("output plugin locks poisoned")
            .entry(plugin_id.to_string())
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone();
        let _guard = lock.lock().expect("output plugin lock poisoned");
        operation()
    }

    pub fn serialize_target<T>(&self, output: &OutputBinding, operation: impl FnOnce() -> T) -> T {
        let key = target_key(output);
        let lock = self
            .target_locks
            .lock()
            .expect("output target locks poisoned")
            .entry(key)
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone();
        let _guard = lock.lock().expect("output target lock poisoned");
        operation()
    }

    pub fn restore_target_owners(
        &self,
        sessions: &[(crate::db::store::AccountId, Session)],
    ) -> Result<(), OutputError> {
        for (account_id, session) in sessions {
            if let Some(output) = &session.output {
                self.claim_target(account_id, output)?;
            }
        }
        Ok(())
    }

    pub fn claim_target(
        &self,
        account_id: &crate::db::store::AccountId,
        output: &OutputBinding,
    ) -> Result<bool, OutputError> {
        let key = target_key(output);
        let mut owners = self
            .target_owners
            .lock()
            .expect("output target owners poisoned");
        match owners.get(&key) {
            Some(owner) if owner != account_id.as_str() => {
                Err(OutputError::TargetInUse(owner.clone()))
            }
            Some(_) => Ok(false),
            None => {
                owners.insert(key, account_id.as_str().to_string());
                Ok(true)
            }
        }
    }

    pub fn release_target(&self, account_id: &crate::db::store::AccountId, output: &OutputBinding) {
        let key = target_key(output);
        let mut owners = self
            .target_owners
            .lock()
            .expect("output target owners poisoned");
        if owners
            .get(&key)
            .is_some_and(|owner| owner == account_id.as_str())
        {
            owners.remove(&key);
        }
    }

    pub fn stream_belongs_to(
        &self,
        session_id: &str,
        output: &OutputBinding,
        stream_url: Option<&str>,
    ) -> bool {
        let Some(stream_url) = stream_url else {
            return false;
        };
        self.active_streams
            .lock()
            .expect("output active streams poisoned")
            .get(&target_key(output))
            .is_some_and(|(owner, expected)| owner == session_id && expected == stream_url)
    }

    pub fn discover(
        &self,
        auth: &AuthContext,
        plugin_id: &str,
    ) -> Result<OutputTopology, OutputError> {
        let value = self.call(auth, plugin_id, "discover", json!({}))?;
        let topology: OutputTopology = serde_json::from_value(value)
            .map_err(|error| OutputError::InvalidOutput(error.to_string()))?;
        validate_topology(&topology)?;
        Ok(topology)
    }

    pub fn set_group(
        &self,
        auth: &AuthContext,
        plugin_id: &str,
        coordinator_id: &str,
        member_ids: &[String],
    ) -> Result<OutputTopology, OutputError> {
        let value = self.call(
            auth,
            plugin_id,
            "group.set",
            json!({ "coordinatorId": coordinator_id, "memberIds": member_ids }),
        )?;
        let topology: OutputTopology = serde_json::from_value(value)
            .map_err(|error| OutputError::InvalidOutput(error.to_string()))?;
        validate_topology(&topology)?;
        Ok(topology)
    }

    pub fn state(
        &self,
        auth: &AuthContext,
        output: &OutputBinding,
    ) -> Result<OutputTransportState, OutputError> {
        let value = self.call(
            auth,
            &output.plugin_id,
            "transport.state",
            json!({ "targetId": output.target_id }),
        )?;
        serde_json::from_value(value).map_err(|error| OutputError::InvalidOutput(error.to_string()))
    }

    pub fn apply_effect(
        &self,
        auth: &AuthContext,
        session_id: &str,
        output: &OutputBinding,
        current: &Session,
        next: &Session,
        command: &SessionCommand,
    ) -> Result<OutputEffect, OutputError> {
        match command {
            SessionCommand::Play => {
                let state = self.state(auth, output)?;
                self.ensure_stream_owner(session_id, output, &state)?;
                self.play_session(auth, session_id, output, next)?;
                Ok(OutputEffect {
                    physical: true,
                    rollback_transport: output_transport(&state),
                    rollback_position_ms: state.position_ms,
                    rollback_duration_ms: state.duration_ms,
                    ..OutputEffect::default()
                })
            }
            SessionCommand::Pause => {
                let state = self.state(auth, output)?;
                self.ensure_stream_owner(session_id, output, &state)?;
                self.call(
                    auth,
                    &output.plugin_id,
                    "transport.pause",
                    json!({ "targetId": output.target_id }),
                )?;
                Ok(OutputEffect {
                    physical: true,
                    commit_position_ms: state.position_ms,
                    commit_duration_ms: state.duration_ms,
                    rollback_transport: output_transport(&state),
                    rollback_position_ms: state.position_ms,
                    rollback_duration_ms: state.duration_ms,
                })
            }
            SessionCommand::Stop => {
                let state = self.state(auth, output)?;
                self.ensure_stream_owner(session_id, output, &state)?;
                self.stop(auth, output)?;
                Ok(OutputEffect {
                    physical: true,
                    rollback_transport: output_transport(&state),
                    rollback_position_ms: state.position_ms,
                    rollback_duration_ms: state.duration_ms,
                    ..OutputEffect::default()
                })
            }
            SessionCommand::VolumeSet { volume } => {
                let state = self.state(auth, output)?;
                self.ensure_stream_owner(session_id, output, &state)?;
                self.set_volume(auth, output, *volume)?;
                Ok(OutputEffect {
                    physical: true,
                    rollback_transport: output_transport(&state),
                    rollback_position_ms: state.position_ms,
                    rollback_duration_ms: state.duration_ms,
                    ..OutputEffect::default()
                })
            }
            SessionCommand::QueueRemove { .. }
            | SessionCommand::QueueClear
            | SessionCommand::CursorJump { .. }
                if current.transport != Transport::Stopped
                    && next.transport == Transport::Stopped =>
            {
                let state = self.state(auth, output)?;
                self.ensure_stream_owner(session_id, output, &state)?;
                self.stop(auth, output)?;
                Ok(OutputEffect {
                    physical: true,
                    rollback_transport: output_transport(&state),
                    rollback_position_ms: state.position_ms,
                    rollback_duration_ms: state.duration_ms,
                    ..OutputEffect::default()
                })
            }
            SessionCommand::QueueAdd { .. }
            | SessionCommand::QueueRemove { .. }
            | SessionCommand::QueueClear
            | SessionCommand::QueueShuffle
            | SessionCommand::CursorJump { .. } => Ok(OutputEffect::default()),
            SessionCommand::TrackEnded | SessionCommand::PositionReport { .. } => {
                Err(OutputError::InvalidOutput(
                    "output sessions accept renderer reports only from the core".into(),
                ))
            }
        }
    }

    fn ensure_stream_owner(
        &self,
        session_id: &str,
        output: &OutputBinding,
        state: &OutputTransportState,
    ) -> Result<(), OutputError> {
        if !matches!(state.state.as_str(), "PLAYING" | "PAUSED_PLAYBACK")
            || self.stream_belongs_to(session_id, output, state.stream_url.as_deref())
        {
            Ok(())
        } else {
            Err(OutputError::RendererOwnershipLost)
        }
    }

    pub fn restore_session(
        &self,
        auth: &AuthContext,
        session_id: &str,
        output: &OutputBinding,
        session: &Session,
    ) -> Result<(), OutputError> {
        self.set_volume(auth, output, session.volume)?;
        match session.transport {
            Transport::Playing => self.play_session(auth, session_id, output, session),
            Transport::Paused => {
                self.play_session(auth, session_id, output, session)?;
                self.call(
                    auth,
                    &output.plugin_id,
                    "transport.pause",
                    json!({ "targetId": output.target_id }),
                )?;
                Ok(())
            }
            Transport::Stopped | Transport::Ended => self.stop(auth, output),
        }
    }

    fn play_session(
        &self,
        auth: &AuthContext,
        session_id: &str,
        output: &OutputBinding,
        session: &Session,
    ) -> Result<(), OutputError> {
        let track_id = session
            .current_track_id()
            .ok_or_else(|| OutputError::InvalidOutput("playing session has no track".into()))?;
        let track = self
            .library
            .get_track(&auth.account_id, track_id)?
            .ok_or_else(|| OutputError::InvalidOutput(format!("track '{track_id}' is missing")))?;
        let candidate =
            match self
                .media
                .resolve(&auth.account_id, track_id, &self.plugins.live_ids())?
            {
                ResolveOutcome::Ready(candidate) => candidate,
                ResolveOutcome::Unavailable => {
                    return Err(OutputError::InvalidOutput(format!(
                        "track '{track_id}' has no available media candidate"
                    )));
                }
            };
        let profile: OutputStreamProfile = serde_json::from_value(self.call(
            auth,
            &output.plugin_id,
            "stream.profile",
            json!({ "targetId": output.target_id }),
        )?)
        .map_err(|error| OutputError::InvalidOutput(error.to_string()))?;
        let resolved_format =
            self.resolve_candidate_format(auth, &candidate, &profile.preferred_formats)?;
        if !format_is_preferred(resolved_format.as_deref(), &profile.preferred_formats) {
            return Err(OutputError::InvalidOutput(format!(
                "track '{track_id}' has no format accepted by output '{}'",
                output.plugin_id
            )));
        }
        let stream_url = self.stream_url(
            &auth.account_id,
            track_id,
            &candidate.id,
            &profile.preferred_formats,
            resolved_format.as_deref(),
        )?;
        let mut metadata = serde_json::Map::from_iter([
            ("title".to_string(), Value::String(track.title)),
            ("artist".to_string(), Value::String(track.artist)),
            (
                "mimeType".to_string(),
                Value::String(
                    crate::stream::media_mime_type(resolved_format.as_deref()).to_string(),
                ),
            ),
        ]);
        if let Some(artwork_url) = track.artwork_url {
            metadata.insert("artworkUrl".into(), Value::String(artwork_url));
        }
        self.active_streams
            .lock()
            .expect("output active streams poisoned")
            .insert(
                target_key(output),
                (session_id.to_string(), stream_url.clone()),
            );
        self.call(
            auth,
            &output.plugin_id,
            "transport.play",
            json!({
                "targetId": output.target_id,
                "streamUrl": stream_url,
                "positionMs": session.position_ms,
                "metadata": metadata,
            }),
        )?;
        Ok(())
    }

    fn set_volume(
        &self,
        auth: &AuthContext,
        output: &OutputBinding,
        volume: u8,
    ) -> Result<(), OutputError> {
        self.call(
            auth,
            &output.plugin_id,
            "volume.set",
            json!({ "targetId": output.target_id, "volume": volume }),
        )?;
        Ok(())
    }

    fn stop(&self, auth: &AuthContext, output: &OutputBinding) -> Result<(), OutputError> {
        self.call(
            auth,
            &output.plugin_id,
            "transport.stop",
            json!({ "targetId": output.target_id }),
        )?;
        Ok(())
    }

    fn resolve_candidate_format(
        &self,
        auth: &AuthContext,
        candidate: &crate::media::ResolvedCandidate,
        preferred_formats: &[String],
    ) -> Result<Option<String>, OutputError> {
        let crate::media::ResolvedLocation::Plugin {
            plugin_id,
            external_id,
        } = &candidate.location
        else {
            return Ok(candidate.format.clone());
        };
        let config = self
            .credentials
            .get(&auth.account_id, plugin_id)?
            .map(Value::from);
        let descriptor = self.plugins.call_for_account(
            plugin_id,
            "source",
            "stream.resolve",
            json!({ "trackId": external_id, "preferredFormats": preferred_formats }),
            auth.account_id.as_str(),
            config,
        )?;
        Ok(descriptor
            .get("format")
            .and_then(Value::as_str)
            .map(str::to_string)
            .or_else(|| candidate.format.clone()))
    }

    fn stream_url(
        &self,
        account_id: &crate::db::store::AccountId,
        track_id: &str,
        candidate_id: &str,
        preferred_formats: &[String],
        selected_format: Option<&str>,
    ) -> Result<String, OutputError> {
        let mut url = self
            .lan_base_url
            .clone()
            .ok_or(OutputError::LanUrlRequired)?;
        {
            let mut segments = url
                .path_segments_mut()
                .map_err(|_| OutputError::LanUrlRequired)?;
            segments.pop_if_empty();
            segments.push("stream");
            segments.push(track_id);
        }
        let token = self.stream_tokens.mint(
            account_id,
            track_id,
            candidate_id,
            preferred_formats,
            selected_format,
        );
        url.query_pairs_mut().append_pair("outputToken", &token);
        Ok(url.to_string())
    }

    fn call(
        &self,
        auth: &AuthContext,
        plugin_id: &str,
        operation: &str,
        input: Value,
    ) -> Result<Value, OutputError> {
        let config = self
            .credentials
            .get(&auth.account_id, plugin_id)?
            .map(Value::from);
        Ok(self.plugins.call_for_account(
            plugin_id,
            "output",
            operation,
            input,
            auth.account_id.as_str(),
            config,
        )?)
    }
}

fn format_is_preferred(format: Option<&str>, preferred_formats: &[String]) -> bool {
    if preferred_formats.is_empty() {
        return true;
    }
    let Some(format) = format.map(str::to_ascii_lowercase) else {
        return false;
    };
    preferred_formats.iter().any(|preferred| {
        let preferred = preferred.to_ascii_lowercase();
        format == preferred || format.starts_with(&format!("{preferred}/"))
    })
}

fn output_transport(state: &OutputTransportState) -> Option<Transport> {
    match state.state.as_str() {
        "PLAYING" => Some(Transport::Playing),
        "PAUSED_PLAYBACK" => Some(Transport::Paused),
        "STOPPED" => Some(Transport::Stopped),
        _ => None,
    }
}

fn target_key(output: &OutputBinding) -> String {
    format!("{}\0{}", output.plugin_id, output.target_id)
}

fn validate_topology(topology: &OutputTopology) -> Result<(), OutputError> {
    let mut ids = HashSet::new();
    for group in &topology.groups {
        if group.id.trim().is_empty()
            || group.coordinator_id.trim().is_empty()
            || group.coordinator_name.trim().is_empty()
            || group.rooms.is_empty()
        {
            return Err(OutputError::InvalidOutput(
                "output groups require identity, coordinator, and rooms".into(),
            ));
        }
        let mut found_coordinator = false;
        for room in &group.rooms {
            if room.id.trim().is_empty()
                || room.name.trim().is_empty()
                || room.address.trim().is_empty()
                || room.location_url.trim().is_empty()
                || !ids.insert(room.id.clone())
            {
                return Err(OutputError::InvalidOutput(
                    "output rooms require unique identity and network metadata".into(),
                ));
            }
            if room.id == group.coordinator_id && room.coordinator {
                found_coordinator = true;
            }
        }
        if !found_coordinator {
            return Err(OutputError::InvalidOutput(
                "output group coordinator is not a coordinator room".into(),
            ));
        }
    }
    Ok(())
}
