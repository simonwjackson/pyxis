//! Versioned line-delimited JSON protocol between the core and plugin subprocesses.
//!
//! Every line is one envelope with a correlation id. Calls are sequential per process in
//! v1, but correlation ids make the contract safe to multiplex later without a rewrite.
//! Media bytes never appear here: a source returns metadata such as a URL and headers, or
//! a provider returns a local file path.

use std::collections::BTreeMap;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use typeshare::typeshare;

pub const PLUGIN_PROTOCOL_VERSION: u32 = 1;

/// JSON represented as a recursive, language-neutral sum type rather than `any`. This is
/// the input/output escape hatch for capability-specific operations while their envelopes
/// and failure behavior stay fully typed.
#[typeshare(serialized_as = "unknown")]
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize, JsonSchema)]
#[serde(untagged)]
pub enum PluginValue {
    Null,
    Bool(bool),
    Integer(i64),
    Unsigned(u64),
    Float(f64),
    String(String),
    Array(Vec<PluginValue>),
    Object(BTreeMap<String, PluginValue>),
}

impl From<serde_json::Value> for PluginValue {
    fn from(value: serde_json::Value) -> Self {
        match value {
            serde_json::Value::Null => PluginValue::Null,
            serde_json::Value::Bool(value) => PluginValue::Bool(value),
            serde_json::Value::Number(value) => {
                if let Some(value) = value.as_i64() {
                    PluginValue::Integer(value)
                } else if let Some(value) = value.as_u64() {
                    PluginValue::Unsigned(value)
                } else {
                    PluginValue::Float(value.as_f64().expect("valid JSON float"))
                }
            }
            serde_json::Value::String(value) => PluginValue::String(value),
            serde_json::Value::Array(values) => {
                PluginValue::Array(values.into_iter().map(PluginValue::from).collect())
            }
            serde_json::Value::Object(values) => PluginValue::Object(
                values
                    .into_iter()
                    .map(|(key, value)| (key, PluginValue::from(value)))
                    .collect(),
            ),
        }
    }
}

impl From<PluginValue> for serde_json::Value {
    fn from(value: PluginValue) -> Self {
        match value {
            PluginValue::Null => serde_json::Value::Null,
            PluginValue::Bool(value) => serde_json::Value::Bool(value),
            PluginValue::Integer(value) => serde_json::Value::Number(value.into()),
            PluginValue::Unsigned(value) => serde_json::Value::Number(value.into()),
            PluginValue::Float(value) => serde_json::Number::from_f64(value)
                .map(serde_json::Value::Number)
                .unwrap_or(serde_json::Value::Null),
            PluginValue::String(value) => serde_json::Value::String(value),
            PluginValue::Array(values) => {
                serde_json::Value::Array(values.into_iter().map(serde_json::Value::from).collect())
            }
            PluginValue::Object(values) => serde_json::Value::Object(
                values
                    .into_iter()
                    .map(|(key, value)| (key, serde_json::Value::from(value)))
                    .collect(),
            ),
        }
    }
}

#[typeshare]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum PluginCapability {
    Source,
    Output,
    Provider,
    Enricher,
}

impl PluginCapability {
    pub fn as_str(self) -> &'static str {
        match self {
            PluginCapability::Source => "source",
            PluginCapability::Output => "output",
            PluginCapability::Provider => "provider",
            PluginCapability::Enricher => "enricher",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "source" => Some(PluginCapability::Source),
            "output" => Some(PluginCapability::Output),
            "provider" => Some(PluginCapability::Provider),
            "enricher" => Some(PluginCapability::Enricher),
            _ => None,
        }
    }
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PluginHandshakeRequest {
    pub protocol_version: u32,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub protocol_version: u32,
    pub capabilities: Vec<PluginCapability>,
    /// JSON Schema for per-account plugin configuration and credentials.
    pub config_schema: PluginValue,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PluginCapabilityCall {
    pub capability: PluginCapability,
    pub operation: String,
    pub input: PluginValue,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PluginFailure {
    pub code: String,
    pub message: String,
    pub retryable: bool,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(tag = "_tag", content = "payload")]
pub enum PluginRequest {
    #[serde(rename = "plugin.handshake")]
    Handshake(PluginHandshakeRequest),
    #[serde(rename = "capability.call")]
    CapabilityCall(PluginCapabilityCall),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(tag = "status", content = "value", rename_all = "camelCase")]
pub enum PluginHandshakeOutcome {
    Ready(PluginManifest),
    Rejected(PluginFailure),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(tag = "status", content = "value", rename_all = "camelCase")]
pub enum PluginCallOutcome {
    Ready(PluginValue),
    Unavailable(PluginFailure),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(tag = "_tag", content = "outcome")]
pub enum PluginResponse {
    #[serde(rename = "plugin.handshake")]
    Handshake(PluginHandshakeOutcome),
    #[serde(rename = "capability.call")]
    CapabilityCall(PluginCallOutcome),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PluginRequestEnvelope {
    pub id: String,
    pub request: PluginRequest,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PluginResponseEnvelope {
    pub id: String,
    pub response: PluginResponse,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn arbitrary_json_round_trips_without_any() {
        let original = serde_json::json!({
            "query": "Bowie",
            "limit": 10,
            "flags": [true, null]
        });
        let typed = PluginValue::from(original.clone());

        assert_eq!(serde_json::Value::from(typed), original);
    }

    #[test]
    fn request_envelope_is_one_line_safe_json() {
        let envelope = PluginRequestEnvelope {
            id: "01".into(),
            request: PluginRequest::Handshake(PluginHandshakeRequest {
                protocol_version: PLUGIN_PROTOCOL_VERSION,
            }),
        };
        let encoded = serde_json::to_string(&envelope).expect("serialize");

        assert!(!encoded.contains('\n'));
        assert_eq!(
            serde_json::from_str::<PluginRequestEnvelope>(&encoded)
                .expect("deserialize")
                .id,
            "01"
        );
    }
}
