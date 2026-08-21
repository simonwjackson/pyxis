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
#[serde(tag = "status", content = "value", rename_all = "camelCase")]
pub enum AccountListOutcome {
    Ready(Vec<RpcAccount>),
    Unavailable(RpcFailure),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(tag = "_tag", content = "payload")]
pub enum RpcRequest {
    #[serde(rename = "system.status.get")]
    SystemStatusGet(EmptyRequest),
    #[serde(rename = "account.list")]
    AccountList(EmptyRequest),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(tag = "_tag", content = "outcome")]
pub enum RpcResponse {
    #[serde(rename = "system.status.get")]
    SystemStatusGet(SystemStatusOutcome),
    #[serde(rename = "account.list")]
    AccountList(AccountListOutcome),
}

impl RpcRequest {
    /// The operation tag as it appears on the wire. Used for logging and for routing
    /// errors back with the tag the caller sent.
    pub fn tag(&self) -> &'static str {
        match self {
            RpcRequest::SystemStatusGet(_) => "system.status.get",
            RpcRequest::AccountList(_) => "account.list",
        }
    }
}

impl RpcResponse {
    pub fn tag(&self) -> &'static str {
        match self {
            RpcResponse::SystemStatusGet(_) => "system.status.get",
            RpcResponse::AccountList(_) => "account.list",
        }
    }
}

/// Schema root, so one generated JSON Schema covers both directions of the wire.
#[derive(JsonSchema)]
pub struct RpcContractSchema {
    pub request: RpcRequest,
    pub response: RpcResponse,
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
        let request_tags = [
            RpcRequest::SystemStatusGet(EmptyRequest {}).tag(),
            RpcRequest::AccountList(EmptyRequest {}).tag(),
        ];
        let response_tags = [
            RpcResponse::SystemStatusGet(SystemStatusOutcome::Unavailable(RpcFailure::permanent(
                "x", "y",
            )))
            .tag(),
            RpcResponse::AccountList(AccountListOutcome::Unavailable(RpcFailure::permanent(
                "x", "y",
            )))
            .tag(),
        ];

        assert_eq!(request_tags, response_tags);
    }

    #[test]
    fn round_trips_through_json() {
        let original = RpcRequest::AccountList(EmptyRequest {});
        let text = serde_json::to_string(&original).expect("serialize");
        let decoded: RpcRequest = serde_json::from_str(&text).expect("deserialize");

        assert_eq!(decoded.tag(), original.tag());
    }
}
