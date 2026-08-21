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
use axum::http::{header, HeaderMap};
use axum::Json;
use serde_json::Value;

use crate::accounts::AuthContext;
use crate::api::AppState;
use crate::rpc::contract::{RpcFailure, RpcRequest, RpcResponse};
use crate::rpc::dispatch::dispatch;

pub async fn rpc(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: Bytes,
) -> Json<RpcResponse> {
    let request = match decode_request(&body) {
        Ok(request) => request,
        Err(response) => return Json(*response),
    };
    let bearer = bearer_token(&headers).map(str::to_owned);

    // Authentication scans hash-only records in ProseQL, and dispatch can write. Keep the
    // entire synchronous path off the async runtime rather than wrapping each store call.
    let response = tokio::task::spawn_blocking(move || {
        let auth = authorize(&state, &request, bearer.as_deref())?;
        Ok::<_, Box<RpcResponse>>(dispatch(&state, request, auth))
    })
    .await;

    Json(match response {
        Ok(Ok(response)) => response,
        Ok(Err(response)) => *response,
        Err(error) => RpcResponse::rejected(RpcFailure::retryable(
            "dispatch.unavailable",
            format!("RPC dispatch task failed: {error}"),
        )),
    })
}

fn authorize(
    state: &AppState,
    request: &RpcRequest,
    bearer: Option<&str>,
) -> Result<Option<AuthContext>, Box<RpcResponse>> {
    if request.is_public() {
        return Ok(None);
    }

    let bearer = bearer.ok_or_else(|| {
        Box::new(RpcResponse::rejected(RpcFailure::permanent(
            "auth.required",
            "this RPC operation requires a bearer token",
        )))
    })?;
    let auth = state
        .accounts
        .authenticate(bearer)
        .map_err(|error| {
            Box::new(RpcResponse::rejected(RpcFailure::retryable(
                "auth.unavailable",
                error.to_string(),
            )))
        })?
        .ok_or_else(|| {
            Box::new(RpcResponse::rejected(RpcFailure::permanent(
                "auth.invalidToken",
                "bearer token is invalid or revoked",
            )))
        })?;

    if let Some(scope) = request.required_scope() {
        if !auth.allows(scope) {
            return Err(Box::new(RpcResponse::rejected(RpcFailure::permanent(
                "auth.insufficientScope",
                format!("operation '{}' requires scope '{scope}'", request.tag()),
            ))));
        }
    }

    Ok(Some(auth))
}

fn bearer_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(header::AUTHORIZATION)?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")
        .filter(|token| !token.is_empty())
}

fn decode_request(bytes: &[u8]) -> Result<RpcRequest, Box<RpcResponse>> {
    let value: Value = serde_json::from_slice(bytes).map_err(|error| {
        Box::new(RpcResponse::rejected(RpcFailure::permanent(
            "request.malformed",
            format!("request is not valid JSON: {error}"),
        )))
    })?;

    let tag = value
        .get("_tag")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| {
            Box::new(RpcResponse::rejected(RpcFailure::permanent(
                "request.invalidPayload",
                "request must contain a string '_tag'",
            )))
        })?;

    if !RpcRequest::is_known_tag(&tag) {
        return Err(Box::new(RpcResponse::rejected(RpcFailure::permanent(
            "request.unknownOperation",
            format!("unknown RPC operation '{tag}'"),
        ))));
    }

    serde_json::from_value(value).map_err(|error| {
        Box::new(RpcResponse::rejected(RpcFailure::permanent(
            "request.invalidPayload",
            format!("invalid payload for '{tag}': {error}"),
        )))
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
