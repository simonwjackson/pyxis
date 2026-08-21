//! Same-origin audio byte service.

pub mod cache;
pub mod proxy;

use std::ops::RangeInclusive;
use std::path::Path;
use std::sync::Arc;

use axum::body::Body;
use axum::extract::{Path as AxumPath, State};
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio_util::io::ReaderStream;

use crate::accounts::SCOPE_ACCOUNT_READ;
use crate::api::AppState;
use crate::media::{ResolveOutcome, ResolvedLocation};
use crate::rpc::contract::RpcFailure;

use cache::StreamCache;
use proxy::{fetch_to_cache, ProxyError, RemoteStreamDescriptor};

#[derive(Clone)]
pub struct StreamService {
    cache: StreamCache,
    client: reqwest::Client,
}

impl StreamService {
    pub fn open(state_dir: &Path) -> anyhow::Result<Self> {
        let cache = StreamCache::open(state_dir)?;
        let client = reqwest::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::limited(10))
            .user_agent(format!("pyxis/{}", crate::version()))
            .build()?;
        Ok(StreamService { cache, client })
    }
}

pub async fn stream(
    State(state): State<Arc<AppState>>,
    AxumPath(track_id): AxumPath<String>,
    headers: HeaderMap,
) -> Response {
    let Some(bearer) = bearer_token(&headers).map(str::to_owned) else {
        return failure(
            StatusCode::UNAUTHORIZED,
            RpcFailure::permanent("auth.required", "stream requires a bearer token"),
        );
    };
    let accounts = state.accounts.clone();
    let auth = match tokio::task::spawn_blocking(move || accounts.authenticate(&bearer)).await {
        Ok(Ok(Some(auth))) if auth.allows(SCOPE_ACCOUNT_READ) => auth,
        Ok(Ok(Some(_))) => {
            return failure(
                StatusCode::FORBIDDEN,
                RpcFailure::permanent("auth.insufficientScope", "stream requires account:read"),
            );
        }
        Ok(Ok(None)) => {
            return failure(
                StatusCode::UNAUTHORIZED,
                RpcFailure::permanent("auth.invalidToken", "bearer token is invalid or revoked"),
            );
        }
        Ok(Err(error)) => {
            return failure(
                StatusCode::SERVICE_UNAVAILABLE,
                RpcFailure::retryable("auth.unavailable", error.to_string()),
            );
        }
        Err(error) => {
            return failure(
                StatusCode::SERVICE_UNAVAILABLE,
                RpcFailure::retryable("auth.unavailable", error.to_string()),
            );
        }
    };

    let media = state.media.clone();
    let plugins = state.plugins.clone();
    let live = plugins.live_ids();
    let account_id = auth.account_id.clone();
    let track_for_resolution = track_id.clone();
    let resolved = tokio::task::spawn_blocking(move || {
        media.resolve(&account_id, &track_for_resolution, &live)
    })
    .await;
    let candidate = match resolved {
        Ok(Ok(ResolveOutcome::Ready(candidate))) => candidate,
        Ok(Ok(ResolveOutcome::Unavailable)) => {
            return failure(
                StatusCode::NOT_FOUND,
                RpcFailure::permanent(
                    "stream.unavailable",
                    format!("track '{track_id}' has no available media candidate"),
                ),
            );
        }
        Ok(Err(error)) => {
            return failure(
                StatusCode::INTERNAL_SERVER_ERROR,
                RpcFailure::retryable("media.unavailable", error.to_string()),
            );
        }
        Err(error) => {
            return failure(
                StatusCode::INTERNAL_SERVER_ERROR,
                RpcFailure::retryable("media.unavailable", error.to_string()),
            );
        }
    };

    let (path, format) = match candidate.location {
        ResolvedLocation::Local { absolute_path, .. } => (absolute_path, candidate.format),
        ResolvedLocation::Plugin {
            plugin_id,
            external_id,
        } => {
            let operation_plugin = plugin_id.clone();
            let resolved = tokio::task::spawn_blocking(move || {
                plugins.call(
                    &operation_plugin,
                    "source",
                    "stream.resolve",
                    json!({ "trackId": external_id }),
                )
            })
            .await;
            let value = match resolved {
                Ok(Ok(value)) => value,
                Ok(Err(error)) => {
                    return failure(
                        StatusCode::BAD_GATEWAY,
                        RpcFailure::retryable("plugin.stream", error.to_string()),
                    );
                }
                Err(error) => {
                    return failure(
                        StatusCode::BAD_GATEWAY,
                        RpcFailure::retryable("plugin.stream", error.to_string()),
                    );
                }
            };
            let descriptor: RemoteStreamDescriptor = match serde_json::from_value(value) {
                Ok(descriptor) => descriptor,
                Err(error) => {
                    return failure(
                        StatusCode::BAD_GATEWAY,
                        RpcFailure::permanent("plugin.invalidStream", error.to_string()),
                    );
                }
            };
            let format = descriptor
                .format
                .clone()
                .or_else(|| candidate.format.clone());
            let path = match fetch_to_cache(
                &state.stream.cache,
                &candidate.id,
                &descriptor,
                &state.stream.client,
            )
            .await
            {
                Ok(path) => path,
                Err(error) => return proxy_failure(error),
            };
            (path, format)
        }
    };

    serve_file(&path, format.as_deref(), headers.get(header::RANGE)).await
}

async fn serve_file(path: &Path, format: Option<&str>, range: Option<&HeaderValue>) -> Response {
    let metadata = match tokio::fs::metadata(path).await {
        Ok(metadata) => metadata,
        Err(error) => {
            return failure(
                StatusCode::NOT_FOUND,
                RpcFailure::retryable("stream.fileMissing", error.to_string()),
            );
        }
    };
    let length = metadata.len();
    if length == 0 {
        return failure(
            StatusCode::INTERNAL_SERVER_ERROR,
            RpcFailure::permanent("stream.empty", "audio file is empty"),
        );
    }
    let requested = match range {
        None => None,
        Some(value) => match value
            .to_str()
            .ok()
            .and_then(|value| byte_range(value, length))
        {
            Some(range) => Some(range),
            None => {
                return Response::builder()
                    .status(StatusCode::RANGE_NOT_SATISFIABLE)
                    .header(header::CONTENT_RANGE, format!("bytes */{length}"))
                    .body(Body::empty())
                    .expect("valid range response");
            }
        },
    };
    let (status, start, end) = requested
        .map(|range| (StatusCode::PARTIAL_CONTENT, *range.start(), *range.end()))
        .unwrap_or((StatusCode::OK, 0, length - 1));
    let response_length = end - start + 1;

    let mut file = match tokio::fs::File::open(path).await {
        Ok(file) => file,
        Err(error) => {
            return failure(
                StatusCode::NOT_FOUND,
                RpcFailure::retryable("stream.fileMissing", error.to_string()),
            );
        }
    };
    if let Err(error) = file.seek(std::io::SeekFrom::Start(start)).await {
        return failure(
            StatusCode::INTERNAL_SERVER_ERROR,
            RpcFailure::retryable("stream.seek", error.to_string()),
        );
    }
    let body = Body::from_stream(ReaderStream::new(file.take(response_length)));
    let mut response = Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, mime_for(format))
        .header(header::CONTENT_LENGTH, response_length)
        .header(header::ACCEPT_RANGES, "bytes");
    if status == StatusCode::PARTIAL_CONTENT {
        response = response.header(
            header::CONTENT_RANGE,
            format!("bytes {start}-{end}/{length}"),
        );
    }
    response.body(body).expect("valid file response")
}

fn byte_range(value: &str, length: u64) -> Option<RangeInclusive<u64>> {
    let value = value.strip_prefix("bytes=")?;
    if value.contains(',') {
        return None;
    }
    let (start, end) = value.split_once('-')?;
    if start.is_empty() {
        let suffix: u64 = end.parse().ok()?;
        if suffix == 0 {
            return None;
        }
        return Some(length.saturating_sub(suffix)..=length - 1);
    }
    let start: u64 = start.parse().ok()?;
    if start >= length {
        return None;
    }
    let end = if end.is_empty() {
        length - 1
    } else {
        end.parse::<u64>().ok()?.min(length - 1)
    };
    (end >= start).then_some(start..=end)
}

fn mime_for(format: Option<&str>) -> &'static str {
    let format = format.unwrap_or_default().to_ascii_lowercase();
    if format.contains("webm") {
        "audio/webm"
    } else if format.contains("mp4") || format.contains("m4a") || format.contains("aac") {
        "audio/mp4"
    } else if format.contains("mp3") {
        "audio/mpeg"
    } else if format.contains("ogg") || format.contains("opus") {
        "audio/ogg"
    } else if format.contains("flac") {
        "audio/flac"
    } else if format.contains("wav") {
        "audio/wav"
    } else {
        "application/octet-stream"
    }
}

fn bearer_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(header::AUTHORIZATION)?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")
        .filter(|token| !token.is_empty())
}

fn proxy_failure(error: ProxyError) -> Response {
    let status = match error {
        ProxyError::Io(_) => StatusCode::INTERNAL_SERVER_ERROR,
        _ => StatusCode::BAD_GATEWAY,
    };
    failure(
        status,
        RpcFailure {
            code: error.code().into(),
            message: error.to_string(),
            retryable: error.retryable(),
        },
    )
}

fn failure(status: StatusCode, failure: RpcFailure) -> Response {
    (
        status,
        Json(json!({
            "_tag": "stream.failure",
            "failure": failure,
        })),
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_open_ended_and_suffix_ranges() {
        assert_eq!(byte_range("bytes=5-", 10), Some(5..=9));
        assert_eq!(byte_range("bytes=-3", 10), Some(7..=9));
    }

    #[test]
    fn rejects_multiple_or_unsatisfiable_ranges() {
        assert_eq!(byte_range("bytes=0-1,3-4", 10), None);
        assert_eq!(byte_range("bytes=10-", 10), None);
        assert_eq!(byte_range("items=0-1", 10), None);
    }
}
