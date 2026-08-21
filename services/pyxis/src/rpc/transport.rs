//! HTTP transport for the tagged-union protocol.
//!
//! HTTP only carries bytes. This module parses those bytes into the contract, rejects
//! unknown tags before dispatch, and serializes one typed response shape. Operation
//! success and failure both use HTTP 200; transport status codes are reserved for failures
//! where no RPC response can be produced at all (for example an intermediary rejecting a
//! body before this handler runs).

use std::sync::Arc;

use axum::body::Bytes;
use axum::extract::State;
use axum::Json;
use serde_json::Value;

use crate::api::AppState;
use crate::rpc::contract::{RpcFailure, RpcRequest, RpcResponse};
use crate::rpc::dispatch::dispatch;

pub async fn rpc(State(state): State<Arc<AppState>>, body: Bytes) -> Json<RpcResponse> {
    let request = match decode_request(&body) {
        Ok(request) => request,
        Err(response) => return Json(response),
    };

    let store = state.store.clone();
    let response = tokio::task::spawn_blocking(move || dispatch(&store, request)).await;

    Json(match response {
        Ok(response) => response,
        Err(error) => RpcResponse::rejected(RpcFailure::retryable(
            "dispatch.unavailable",
            format!("RPC dispatch task failed: {error}"),
        )),
    })
}

fn decode_request(bytes: &[u8]) -> Result<RpcRequest, RpcResponse> {
    let value: Value = serde_json::from_slice(bytes).map_err(|error| {
        RpcResponse::rejected(RpcFailure::permanent(
            "request.malformed",
            format!("request is not valid JSON: {error}"),
        ))
    })?;

    let tag = value
        .get("_tag")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| {
            RpcResponse::rejected(RpcFailure::permanent(
                "request.invalidPayload",
                "request must contain a string '_tag'",
            ))
        })?;

    if !RpcRequest::is_known_tag(&tag) {
        return Err(RpcResponse::rejected(RpcFailure::permanent(
            "request.unknownOperation",
            format!("unknown RPC operation '{tag}'"),
        )));
    }

    serde_json::from_value(value).map_err(|error| {
        RpcResponse::rejected(RpcFailure::permanent(
            "request.invalidPayload",
            format!("invalid payload for '{tag}': {error}"),
        ))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_tag_is_invalid_payload() {
        let error = decode_request(br#"{"payload":{}}"#).expect_err("reject");
        let encoded = serde_json::to_value(error).expect("serialize");

        assert_eq!(
            encoded["outcome"]["value"]["code"],
            "request.invalidPayload"
        );
    }

    #[test]
    fn known_tag_with_wrong_payload_is_not_misreported_as_unknown() {
        let error = decode_request(br#"{"_tag":"system.status.get","payload":{"surprise":true}}"#)
            .expect_err("reject");
        let encoded = serde_json::to_value(error).expect("serialize");

        assert_eq!(
            encoded["outcome"]["value"]["code"],
            "request.invalidPayload"
        );
    }
}
