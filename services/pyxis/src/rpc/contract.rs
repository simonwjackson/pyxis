//! The application protocol.
//!
//! This module is the source of truth for every wire shape. `contracts/generated/pyxis.ts`
//! and `contracts/generated/pyxis.schema.json` are build artifacts produced from it by
//! `services/pyxis/generate-contracts.sh` and must never be hand-edited.
//!
//! Conventions, which third-party clients can rely on:
//!
//! - A request is `{ "_tag": "entity.concept.action", "payload": { .. } }`.
//! - A response is `{ "_tag": "entity.concept.action", "outcome": { .. } }`.
//! - An outcome is `{ "status": "..", "value": .. }`. Operations report failure through
//!   their outcome rather than through transport status codes, so a client handles one
//!   shape instead of two.
//! - Every operation has an `unavailable` outcome carrying [`RpcFailure`].
//!
//! Media bytes are deliberately outside this contract. They travel over plain HTTP at
//! `/stream/:trackId` so that ordinary range requests, caching and speaker hardware work
//! without protocol translation.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use typeshare::typeshare;

use crate::plugins::protocol::{PluginRequestEnvelope, PluginResponseEnvelope};

/// Wire identity. v2 shares no protocol lineage with v1, and a client that speaks the v1
/// protocol must fail rather than half-work.
pub const CONTRACT_ID: &str = "pyxis-rpc-v2";

/// Uniform failure envelope.
///
/// `retryable` exists so an offline client can decide whether to keep a queued write or
/// surface it as a permanent error, without parsing `code` strings.
#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RpcFailure {
    pub code: String,
    pub message: String,
    pub retryable: bool,
}

impl RpcFailure {
    pub fn permanent(code: impl Into<String>, message: impl Into<String>) -> Self {
        RpcFailure {
            code: code.into(),
            message: message.into(),
            retryable: false,
        }
    }

    pub fn retryable(code: impl Into<String>, message: impl Into<String>) -> Self {
        RpcFailure {
            code: code.into(),
            message: message.into(),
            retryable: true,
        }
    }
}

#[typeshare]
#[derive(Clone, Debug, Default, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EmptyRequest {}

/// Service health and capability summary.
///
/// `pluginCount` and `capabilities` are part of status because the core is required to run
/// with zero plugins installed. A client discovers what is actually possible here rather
/// than assuming a provider exists.
#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RpcSystemStatus {
    pub version: String,
    pub contract_id: String,
    pub account_count: u32,
    pub plugin_count: u32,
    /// Capability classes currently served by at least one live plugin, for example
    /// `source` or `output`. Empty is a valid, working state.
    pub capabilities: Vec<String>,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(tag = "status", content = "value", rename_all = "camelCase")]
pub enum SystemStatusOutcome {
    Ready(RpcSystemStatus),
    Unavailable(RpcFailure),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RpcAccount {
    pub id: String,
    pub name: String,
    /// True for the account created automatically on first boot. Exactly one account
    /// carries this flag.
    pub is_default: bool,
    pub created_at: String,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RpcDevice {
    pub id: String,
    pub name: String,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RpcAuthGrant {
    pub account: RpcAccount,
    pub device: RpcDevice,
    /// Returned exactly once. Clients persist this in their local ProseQL worker store.
    pub bearer_token: String,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DeviceClaimRequest {
    pub name: String,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DevicePairRequest {
    pub name: String,
    pub code: String,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AccountCreateRequest {
    pub name: String,
    /// The creating physical device gets a new grant scoped to the new account.
    pub device_name: String,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RpcPairingCode {
    pub code: String,
    pub expires_at: String,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ApiTokenCreateRequest {
    pub name: String,
    pub scopes: Vec<String>,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ApiTokenRevokeRequest {
    pub token_id: String,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RpcApiToken {
    pub id: String,
    pub name: String,
    pub scopes: Vec<String>,
    pub created_at: String,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RpcApiTokenGrant {
    pub token: RpcApiToken,
    /// Returned once; only its hash is stored.
    pub bearer_token: String,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(tag = "status", content = "value", rename_all = "camelCase")]
pub enum AccountListOutcome {
    Ready(Vec<RpcAccount>),
    Unavailable(RpcFailure),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(tag = "status", content = "value", rename_all = "camelCase")]
pub enum DeviceClaimOutcome {
    Ready(RpcAuthGrant),
    PairingRequired,
    Unavailable(RpcFailure),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(tag = "status", content = "value", rename_all = "camelCase")]
pub enum DevicePairOutcome {
    Ready(RpcAuthGrant),
    InvalidCode,
    Expired,
    Unavailable(RpcFailure),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(tag = "status", content = "value", rename_all = "camelCase")]
pub enum AccountCreateOutcome {
    Ready(RpcAuthGrant),
    NameTaken,
    Unavailable(RpcFailure),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(tag = "status", content = "value", rename_all = "camelCase")]
pub enum PairingCreateOutcome {
    Ready(RpcPairingCode),
    Unavailable(RpcFailure),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(tag = "status", content = "value", rename_all = "camelCase")]
pub enum ApiTokenCreateOutcome {
    Ready(RpcApiTokenGrant),
    InvalidScope(RpcFailure),
    Unavailable(RpcFailure),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(tag = "status", content = "value", rename_all = "camelCase")]
pub enum CommandOutcome {
    Succeeded,
    Unknown,
    Unavailable(RpcFailure),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RpcPlugin {
    pub id: String,
    pub name: String,
    pub version: String,
    pub capabilities: Vec<String>,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(tag = "status", content = "value", rename_all = "camelCase")]
pub enum PluginListOutcome {
    Ready(Vec<RpcPlugin>),
    Unavailable(RpcFailure),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourceSearchRequest {
    pub query: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RpcSearchTrack {
    pub id: String,
    pub title: String,
    pub artist: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub album: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub artwork_url: Option<String>,
    pub source_plugin_id: String,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RpcSourceFailure {
    pub plugin_id: String,
    pub failure: RpcFailure,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RpcSourceSearchResult {
    pub tracks: Vec<RpcSearchTrack>,
    pub failures: Vec<RpcSourceFailure>,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(tag = "status", content = "value", rename_all = "camelCase")]
pub enum SourceSearchOutcome {
    Ready(RpcSourceSearchResult),
    NoSources,
    Unavailable(RpcFailure),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RpcFidelity {
    pub lossless: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bitrate_kbps: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sample_rate_hz: Option<u32>,
}

/// Public candidate metadata. A local file path is intentionally absent: clients receive
/// same-origin `/stream/:trackId` URLs and never learn server filesystem layout.
#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RpcMediaCandidate {
    pub id: String,
    pub track_id: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plugin_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub external_id: Option<String>,
    pub fidelity: RpcFidelity,
}

#[typeshare]
#[derive(Clone, Copy, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum RpcTransport {
    Stopped,
    Playing,
    Paused,
    Ended,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RpcSession {
    pub id: String,
    pub name: String,
    pub host_device_id: String,
    pub queue: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_track_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream_path: Option<String>,
    pub transport: RpcTransport,
    pub position_ms: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u32>,
    pub volume: u8,
    pub reachable: bool,
    pub revision: u32,
    pub updated_at: String,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SessionCreateRequest {
    pub name: String,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SessionIdRequest {
    pub session_id: String,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct QueueAddCommand {
    pub track_ids: Vec<String>,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct QueueRemoveCommand {
    pub index: u32,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CursorJumpCommand {
    pub index: u32,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PositionReportCommand {
    pub position_ms: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u32>,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VolumeSetCommand {
    pub volume: u8,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(tag = "_tag", content = "payload")]
pub enum RpcSessionCommand {
    #[serde(rename = "queue.add")]
    QueueAdd(QueueAddCommand),
    #[serde(rename = "queue.remove")]
    QueueRemove(QueueRemoveCommand),
    #[serde(rename = "queue.clear")]
    QueueClear(EmptyRequest),
    #[serde(rename = "queue.shuffle")]
    QueueShuffle(EmptyRequest),
    #[serde(rename = "cursor.jump")]
    CursorJump(CursorJumpCommand),
    #[serde(rename = "transport.play")]
    Play(EmptyRequest),
    #[serde(rename = "transport.pause")]
    Pause(EmptyRequest),
    #[serde(rename = "transport.stop")]
    Stop(EmptyRequest),
    #[serde(rename = "transport.trackEnded")]
    TrackEnded(EmptyRequest),
    #[serde(rename = "position.report")]
    PositionReport(PositionReportCommand),
    #[serde(rename = "volume.set")]
    VolumeSet(VolumeSetCommand),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SessionCommandRequest {
    pub session_id: String,
    pub command: RpcSessionCommand,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(tag = "status", content = "value", rename_all = "camelCase")]
pub enum SessionCreateOutcome {
    Ready(RpcSession),
    NotDevice,
    Unavailable(RpcFailure),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(tag = "status", content = "value", rename_all = "camelCase")]
pub enum SessionListOutcome {
    Ready(Vec<RpcSession>),
    Unavailable(RpcFailure),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(tag = "status", content = "value", rename_all = "camelCase")]
pub enum SessionStateOutcome {
    Ready(RpcSession),
    Unknown,
    Unavailable(RpcFailure),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(tag = "status", content = "value", rename_all = "camelCase")]
pub enum SessionCommandOutcome {
    Applied(RpcSession),
    UnknownSession,
    NotHost,
    NotDevice,
    Rejected(RpcFailure),
    Unavailable(RpcFailure),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(tag = "_tag", content = "payload")]
pub enum RpcRequest {
    #[serde(rename = "system.status.get")]
    SystemStatusGet(EmptyRequest),
    #[serde(rename = "auth.device.claim")]
    AuthDeviceClaim(DeviceClaimRequest),
    #[serde(rename = "auth.device.pair")]
    AuthDevicePair(DevicePairRequest),
    #[serde(rename = "auth.pairing.create")]
    AuthPairingCreate(EmptyRequest),
    #[serde(rename = "auth.token.create")]
    AuthTokenCreate(ApiTokenCreateRequest),
    #[serde(rename = "auth.token.revoke")]
    AuthTokenRevoke(ApiTokenRevokeRequest),
    #[serde(rename = "account.list")]
    AccountList(EmptyRequest),
    #[serde(rename = "account.create")]
    AccountCreate(AccountCreateRequest),
    #[serde(rename = "plugin.list")]
    PluginList(EmptyRequest),
    #[serde(rename = "session.create")]
    SessionCreate(SessionCreateRequest),
    #[serde(rename = "session.list")]
    SessionList(EmptyRequest),
    #[serde(rename = "session.state.get")]
    SessionStateGet(SessionIdRequest),
    #[serde(rename = "session.command.run")]
    SessionCommandRun(SessionCommandRequest),
    #[serde(rename = "source.search.run")]
    SourceSearchRun(SourceSearchRequest),
}

/// A request that cannot enter operation dispatch. This is separate from an operation's
/// `unavailable` outcome: no operation exists yet to own the failure.
#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(tag = "status", content = "value", rename_all = "camelCase")]
pub enum RpcProtocolFailureOutcome {
    Rejected(RpcFailure),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(tag = "_tag", content = "outcome")]
pub enum RpcResponse {
    #[serde(rename = "system.status.get")]
    SystemStatusGet(SystemStatusOutcome),
    #[serde(rename = "auth.device.claim")]
    AuthDeviceClaim(DeviceClaimOutcome),
    #[serde(rename = "auth.device.pair")]
    AuthDevicePair(DevicePairOutcome),
    #[serde(rename = "auth.pairing.create")]
    AuthPairingCreate(PairingCreateOutcome),
    #[serde(rename = "auth.token.create")]
    AuthTokenCreate(ApiTokenCreateOutcome),
    #[serde(rename = "auth.token.revoke")]
    AuthTokenRevoke(CommandOutcome),
    #[serde(rename = "account.list")]
    AccountList(AccountListOutcome),
    #[serde(rename = "account.create")]
    AccountCreate(AccountCreateOutcome),
    #[serde(rename = "plugin.list")]
    PluginList(PluginListOutcome),
    #[serde(rename = "session.create")]
    SessionCreate(SessionCreateOutcome),
    #[serde(rename = "session.list")]
    SessionList(SessionListOutcome),
    #[serde(rename = "session.state.get")]
    SessionStateGet(SessionStateOutcome),
    #[serde(rename = "session.command.run")]
    SessionCommandRun(SessionCommandOutcome),
    #[serde(rename = "source.search.run")]
    SourceSearchRun(SourceSearchOutcome),
    #[serde(rename = "rpc.failure")]
    Failure(RpcProtocolFailureOutcome),
}

impl RpcRequest {
    pub const KNOWN_TAGS: [&'static str; 14] = [
        "system.status.get",
        "auth.device.claim",
        "auth.device.pair",
        "auth.pairing.create",
        "auth.token.create",
        "auth.token.revoke",
        "account.list",
        "account.create",
        "plugin.list",
        "session.create",
        "session.list",
        "session.state.get",
        "session.command.run",
        "source.search.run",
    ];

    /// The operation tag as it appears on the wire. Used for logging and authorization.
    pub fn tag(&self) -> &'static str {
        match self {
            RpcRequest::SystemStatusGet(_) => "system.status.get",
            RpcRequest::AuthDeviceClaim(_) => "auth.device.claim",
            RpcRequest::AuthDevicePair(_) => "auth.device.pair",
            RpcRequest::AuthPairingCreate(_) => "auth.pairing.create",
            RpcRequest::AuthTokenCreate(_) => "auth.token.create",
            RpcRequest::AuthTokenRevoke(_) => "auth.token.revoke",
            RpcRequest::AccountList(_) => "account.list",
            RpcRequest::AccountCreate(_) => "account.create",
            RpcRequest::PluginList(_) => "plugin.list",
            RpcRequest::SessionCreate(_) => "session.create",
            RpcRequest::SessionList(_) => "session.list",
            RpcRequest::SessionStateGet(_) => "session.state.get",
            RpcRequest::SessionCommandRun(_) => "session.command.run",
            RpcRequest::SourceSearchRun(_) => "source.search.run",
        }
    }

    pub fn is_known_tag(tag: &str) -> bool {
        Self::KNOWN_TAGS.contains(&tag)
    }

    pub fn is_public(&self) -> bool {
        matches!(
            self,
            RpcRequest::SystemStatusGet(_)
                | RpcRequest::AuthDeviceClaim(_)
                | RpcRequest::AuthDevicePair(_)
        )
    }

    pub fn required_scope(&self) -> Option<&'static str> {
        match self {
            RpcRequest::SystemStatusGet(_)
            | RpcRequest::AuthDeviceClaim(_)
            | RpcRequest::AuthDevicePair(_) => None,
            RpcRequest::AccountList(_) | RpcRequest::PluginList(_) => Some("account:read"),
            RpcRequest::SessionList(_) | RpcRequest::SessionStateGet(_) => Some("session:read"),
            RpcRequest::SessionCreate(_) | RpcRequest::SessionCommandRun(_) => {
                Some("session:control")
            }
            RpcRequest::SourceSearchRun(_) => Some("source:read"),
            RpcRequest::AuthPairingCreate(_)
            | RpcRequest::AuthTokenCreate(_)
            | RpcRequest::AuthTokenRevoke(_)
            | RpcRequest::AccountCreate(_) => Some("account:admin"),
        }
    }
}

impl RpcResponse {
    pub const KNOWN_OPERATION_TAGS: [&'static str; 14] = RpcRequest::KNOWN_TAGS;

    pub fn tag(&self) -> &'static str {
        match self {
            RpcResponse::SystemStatusGet(_) => "system.status.get",
            RpcResponse::AuthDeviceClaim(_) => "auth.device.claim",
            RpcResponse::AuthDevicePair(_) => "auth.device.pair",
            RpcResponse::AuthPairingCreate(_) => "auth.pairing.create",
            RpcResponse::AuthTokenCreate(_) => "auth.token.create",
            RpcResponse::AuthTokenRevoke(_) => "auth.token.revoke",
            RpcResponse::AccountList(_) => "account.list",
            RpcResponse::AccountCreate(_) => "account.create",
            RpcResponse::PluginList(_) => "plugin.list",
            RpcResponse::SessionCreate(_) => "session.create",
            RpcResponse::SessionList(_) => "session.list",
            RpcResponse::SessionStateGet(_) => "session.state.get",
            RpcResponse::SessionCommandRun(_) => "session.command.run",
            RpcResponse::SourceSearchRun(_) => "source.search.run",
            RpcResponse::Failure(_) => "rpc.failure",
        }
    }

    pub fn rejected(failure: RpcFailure) -> Self {
        RpcResponse::Failure(RpcProtocolFailureOutcome::Rejected(failure))
    }
}

/// Schema root, so one generated JSON Schema covers both directions of the wire.
#[derive(JsonSchema)]
pub struct RpcContractSchema {
    pub request: RpcRequest,
    pub response: RpcResponse,
    pub plugin_request: PluginRequestEnvelope,
    pub plugin_response: PluginResponseEnvelope,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn contract_id_declares_v2_and_shares_no_lineage_with_v1() {
        assert_eq!(CONTRACT_ID, "pyxis-rpc-v2");
    }

    #[test]
    fn requests_serialize_as_tag_and_payload() {
        let encoded =
            serde_json::to_value(RpcRequest::SystemStatusGet(EmptyRequest {})).expect("serialize");

        assert_eq!(encoded["_tag"], "system.status.get");
        assert!(encoded["payload"].is_object());
    }

    #[test]
    fn outcomes_serialize_as_status_and_value() {
        let encoded = serde_json::to_value(RpcResponse::AccountList(AccountListOutcome::Ready(
            Vec::new(),
        )))
        .expect("serialize");

        assert_eq!(encoded["_tag"], "account.list");
        assert_eq!(encoded["outcome"]["status"], "ready");
        assert!(encoded["outcome"]["value"].is_array());
    }

    #[test]
    fn failures_travel_inside_the_outcome_not_the_transport() {
        let outcome = SystemStatusOutcome::Unavailable(RpcFailure::retryable(
            "store.locked",
            "another process holds the store lock",
        ));
        let encoded = serde_json::to_value(outcome).expect("serialize");

        assert_eq!(encoded["status"], "unavailable");
        assert_eq!(encoded["value"]["code"], "store.locked");
        assert_eq!(encoded["value"]["retryable"], true);
    }

    #[test]
    fn unknown_fields_are_rejected_at_the_trust_boundary() {
        let decoded: Result<EmptyRequest, _> = serde_json::from_str(r#"{"surprise":1}"#);

        assert!(decoded.is_err());
    }

    #[test]
    fn every_request_tag_has_a_matching_response_tag() {
        assert_eq!(RpcRequest::KNOWN_TAGS, RpcResponse::KNOWN_OPERATION_TAGS);
    }

    #[test]
    fn round_trips_through_json() {
        let original = RpcRequest::AccountList(EmptyRequest {});
        let text = serde_json::to_string(&original).expect("serialize");
        let decoded: RpcRequest = serde_json::from_str(&text).expect("deserialize");

        assert_eq!(decoded.tag(), original.tag());
    }
}
