//! Same-origin audio byte service.

pub mod cache;
pub mod proxy;

use std::collections::HashMap;
use std::ops::RangeInclusive;
use std::path::Path;
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

use axum::body::Body;
use axum::extract::{Path as AxumPath, Query, State};
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;
use serde_json::json;
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio_util::io::ReaderStream;
use ulid::Ulid;

use crate::accounts::SCOPE_ACCOUNT_READ;
use crate::api::AppState;
use crate::db::store::AccountId;
use crate::media::{ResolveOutcome, ResolvedLocation};
use crate::plugin_credentials::CredentialVault;
use crate::plugins::host::PluginHost;
use crate::rpc::contract::RpcFailure;

use cache::StreamCache;
use proxy::{fetch_to_cache, ProxyError, RemoteStreamDescriptor, MAX_STREAM_BYTES};

#[derive(Clone, Default)]
pub struct OutputStreamTokens {
    tokens: Arc<RwLock<HashMap<String, OutputStreamToken>>>,
}

#[derive(Clone)]
struct OutputStreamToken {
    account_id: AccountId,
    track_id: String,
    candidate_id: String,
    preferred_formats: Vec<String>,
    selected_format: Option<String>,
    expires_at: Instant,
}

impl OutputStreamTokens {
    pub fn mint(
        &self,
        account_id: &AccountId,
        track_id: &str,
        candidate_id: &str,
        preferred_formats: &[String],
        selected_format: Option<&str>,
    ) -> String {
        let token = Ulid::new().to_string();
        let mut tokens = self.tokens.write().expect("output stream tokens poisoned");
        let now = Instant::now();
        tokens.retain(|_, entry| entry.expires_at > now);
        tokens.insert(
            token.clone(),
            OutputStreamToken {
                account_id: account_id.clone(),
                track_id: track_id.to_string(),
                candidate_id: candidate_id.to_string(),
                preferred_formats: preferred_formats.to_vec(),
                selected_format: selected_format.map(str::to_string),
                expires_at: now + Duration::from_secs(6 * 60 * 60),
            },
        );
        token
    }

    fn authorize(
        &self,
        token: &str,
        track_id: &str,
    ) -> Option<(AccountId, String, Vec<String>, Option<String>)> {
        let tokens = self.tokens.read().expect("output stream tokens poisoned");
        let entry = tokens.get(token)?;
        (entry.expires_at > Instant::now() && entry.track_id == track_id).then(|| {
            (
                entry.account_id.clone(),
                entry.candidate_id.clone(),
                entry.preferred_formats.clone(),
                entry.selected_format.clone(),
            )
        })
    }
}

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
            // Google media URLs resolved by yt-dlp reject otherwise identical ranged
            // requests over HTTP/2. HTTP/1.1 is also the common denominator for speaker
            // and publisher CDNs, so keep this byte-fetch client deliberately conservative.
            .http1_only()
            .redirect(reqwest::redirect::Policy::limited(10))
            .user_agent(format!("pyxis/{}", crate::version()))
            .build()?;
        Ok(StreamService { cache, client })
    }
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamQuery {
    output_token: Option<String>,
}

pub async fn stream(
    State(state): State<Arc<AppState>>,
    AxumPath(track_id): AxumPath<String>,
    Query(query): Query<StreamQuery>,
    headers: HeaderMap,
) -> Response {
    let (account_id, expected_candidate_id, preferred_formats, selected_format) =
        if let Some((account_id, candidate_id, preferred_formats, selected_format)) = query
            .output_token
            .as_deref()
            .and_then(|token| state.output_stream_tokens.authorize(token, &track_id))
        {
            (
                account_id,
                Some(candidate_id),
                preferred_formats,
                selected_format,
            )
        } else {
            let Some(bearer) = bearer_token(&headers).map(str::to_owned) else {
                return failure(
                    StatusCode::UNAUTHORIZED,
                    RpcFailure::permanent("auth.required", "stream requires a bearer token"),
                );
            };
            let accounts = state.accounts.clone();
            let auth =
                match tokio::task::spawn_blocking(move || accounts.authenticate(&bearer)).await {
                    Ok(Ok(Some(auth))) if auth.allows(SCOPE_ACCOUNT_READ) => auth,
                    Ok(Ok(Some(_))) => {
                        return failure(
                            StatusCode::FORBIDDEN,
                            RpcFailure::permanent(
                                "auth.insufficientScope",
                                "stream requires account:read",
                            ),
                        );
                    }
                    Ok(Ok(None)) => {
                        return failure(
                            StatusCode::UNAUTHORIZED,
                            RpcFailure::permanent(
                                "auth.invalidToken",
                                "bearer token is invalid or revoked",
                            ),
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
            (auth.account_id, None, Vec::new(), None)
        };

    let media = state.media.clone();
    let plugins = state.plugins.clone();
    let live = plugins.live_ids();
    let resolution_account_id = account_id.clone();
    let track_for_resolution = track_id.clone();
    let candidate_for_resolution = expected_candidate_id.clone();
    let resolved = tokio::task::spawn_blocking(move || match candidate_for_resolution {
        Some(candidate_id) => media.resolve_id(
            &resolution_account_id,
            &track_for_resolution,
            &candidate_id,
            &live,
        ),
        None => media.resolve(&resolution_account_id, &track_for_resolution, &live),
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

    let candidate_id = candidate.id.clone();
    let cache_key = match &selected_format {
        Some(format) => format!("{}:selected:{format}", candidate.id),
        None if preferred_formats.is_empty() => candidate.id.clone(),
        None => format!("{}:preferred:{}", candidate.id, preferred_formats.join(",")),
    };
    let (path, format) = match candidate.location {
        ResolvedLocation::Local { absolute_path, .. } => {
            if !format_matches_selected(candidate.format.as_deref(), selected_format.as_deref()) {
                return failure(
                    StatusCode::CONFLICT,
                    RpcFailure::permanent(
                        "stream.formatChanged",
                        "the output ticket's selected media format is no longer available",
                    ),
                );
            }
            (absolute_path, candidate.format)
        }
        ResolvedLocation::Plugin {
            plugin_id,
            external_id,
        } => {
            let mut descriptor = match resolve_plugin_stream(
                plugins.clone(),
                state.plugin_credentials.clone(),
                account_id.clone(),
                plugin_id.clone(),
                external_id.clone(),
                preferred_formats.clone(),
            )
            .await
            {
                Ok(descriptor) => descriptor,
                Err(error) => return failure(StatusCode::BAD_GATEWAY, error),
            };
            if !format_matches_selected(descriptor.format.as_deref(), selected_format.as_deref()) {
                return failure(
                    StatusCode::BAD_GATEWAY,
                    RpcFailure::retryable(
                        "plugin.streamFormat",
                        "source did not honor the output ticket's selected format",
                    ),
                );
            }
            let mut fetched = fetch_to_cache(
                &state.stream.cache,
                &cache_key,
                &descriptor,
                &state.stream.client,
            )
            .await;

            // Provider media URLs expire, but sessions persist only track identity. A
            // credential-style status gets one fresh resolution; every other failure is
            // returned immediately, and a second expiry is not retried again.
            if matches!(fetched, Err(ProxyError::Status(401 | 403 | 410))) {
                descriptor = match resolve_plugin_stream(
                    plugins.clone(),
                    state.plugin_credentials.clone(),
                    account_id.clone(),
                    plugin_id.clone(),
                    external_id.clone(),
                    preferred_formats.clone(),
                )
                .await
                {
                    Ok(descriptor) => descriptor,
                    Err(error) => return failure(StatusCode::BAD_GATEWAY, error),
                };
                if !format_matches_selected(
                    descriptor.format.as_deref(),
                    selected_format.as_deref(),
                ) {
                    return failure(
                        StatusCode::BAD_GATEWAY,
                        RpcFailure::retryable(
                            "plugin.streamFormat",
                            "source did not honor the output ticket's selected format",
                        ),
                    );
                }
                fetched = fetch_to_cache(
                    &state.stream.cache,
                    &cache_key,
                    &descriptor,
                    &state.stream.client,
                )
                .await;
            }

            let path = match fetched {
                Ok(path) => path,
                Err(ProxyError::Status(401 | 403 | 410)) => {
                    match fetch_via_plugin(
                        &state.stream.cache,
                        &cache_key,
                        plugins,
                        state.plugin_credentials.clone(),
                        PluginStreamRequest {
                            account_id: account_id.clone(),
                            plugin_id,
                            external_id,
                            preferred_formats: preferred_formats.clone(),
                        },
                    )
                    .await
                    {
                        Ok(path) => path,
                        Err(error) => return failure(StatusCode::BAD_GATEWAY, error),
                    }
                }
                Err(error) => return proxy_failure(error),
            };
            let format = descriptor
                .format
                .clone()
                .or_else(|| candidate.format.clone());
            (path, format)
        }
    };

    serve_file(
        &path,
        format.as_deref(),
        &candidate_id,
        headers.get(header::RANGE),
    )
    .await
}

async fn resolve_plugin_stream(
    plugins: PluginHost,
    credentials: CredentialVault,
    account_id: AccountId,
    plugin_id: String,
    external_id: String,
    preferred_formats: Vec<String>,
) -> Result<RemoteStreamDescriptor, RpcFailure> {
    let resolved = tokio::task::spawn_blocking(move || {
        let config = credentials
            .get(&account_id, &plugin_id)
            .map_err(|error| error.to_string())?
            .map(serde_json::Value::from);
        let mut input = json!({ "trackId": external_id });
        if !preferred_formats.is_empty() {
            input["preferredFormats"] = json!(preferred_formats);
        }
        plugins
            .call_for_account(
                &plugin_id,
                "source",
                "stream.resolve",
                input,
                account_id.as_str(),
                config,
            )
            .map_err(|error| error.to_string())
    })
    .await;
    let value = match resolved {
        Ok(Ok(value)) => value,
        Ok(Err(error)) => {
            return Err(RpcFailure::retryable("plugin.stream", error));
        }
        Err(error) => {
            return Err(RpcFailure::retryable("plugin.stream", error.to_string()));
        }
    };
    serde_json::from_value(value)
        .map_err(|error| RpcFailure::permanent("plugin.invalidStream", error.to_string()))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PluginFileResponse {
    kind: String,
    target_path: String,
}

struct PluginStreamRequest {
    account_id: AccountId,
    plugin_id: String,
    external_id: String,
    preferred_formats: Vec<String>,
}

async fn fetch_via_plugin(
    cache: &StreamCache,
    key: &str,
    plugins: PluginHost,
    credentials: CredentialVault,
    request: PluginStreamRequest,
) -> Result<std::path::PathBuf, RpcFailure> {
    let target = cache.path(key);
    if target.is_file() {
        return Ok(target);
    }
    let lock = cache.lock_for(key).await;
    let _guard = lock.lock().await;
    if target.is_file() {
        return Ok(target);
    }

    let temporary = cache.temporary(key);
    let target_path = temporary.to_string_lossy().into_owned();
    let operation_path = target_path.clone();
    let called = tokio::task::spawn_blocking(move || {
        let config = credentials
            .get(&request.account_id, &request.plugin_id)
            .map_err(|error| error.to_string())?
            .map(serde_json::Value::from);
        let mut input = json!({ "trackId": request.external_id, "targetPath": operation_path });
        if !request.preferred_formats.is_empty() {
            input["preferredFormats"] = json!(request.preferred_formats);
        }
        plugins
            .call_for_account(
                &request.plugin_id,
                "source",
                "stream.fetch",
                input,
                request.account_id.as_str(),
                config,
            )
            .map_err(|error| error.to_string())
    })
    .await;
    let result = async {
        let value = match called {
            Ok(Ok(value)) => value,
            Ok(Err(error)) => {
                return Err(RpcFailure::retryable(
                    "plugin.streamFetch",
                    error.to_string(),
                ));
            }
            Err(error) => {
                return Err(RpcFailure::retryable(
                    "plugin.streamFetch",
                    error.to_string(),
                ));
            }
        };
        let response: PluginFileResponse = serde_json::from_value(value).map_err(|error| {
            RpcFailure::permanent("plugin.invalidStreamFetch", error.to_string())
        })?;
        if response.kind != "local" || response.target_path != target_path {
            return Err(RpcFailure::permanent(
                "plugin.invalidStreamFetch",
                "plugin did not confirm the exact core-owned target path",
            ));
        }
        let metadata = tokio::fs::metadata(&temporary)
            .await
            .map_err(|error| RpcFailure::retryable("plugin.streamFetch", error.to_string()))?;
        if !metadata.is_file() || metadata.len() == 0 {
            return Err(RpcFailure::retryable(
                "plugin.streamFetch",
                "plugin completed without writing audio bytes",
            ));
        }
        if metadata.len() > MAX_STREAM_BYTES {
            return Err(RpcFailure::permanent(
                "upstream.tooLarge",
                format!("plugin wrote more than {MAX_STREAM_BYTES} bytes"),
            ));
        }
        let file = tokio::fs::File::open(&temporary)
            .await
            .map_err(|error| RpcFailure::retryable("cache.io", error.to_string()))?;
        file.sync_all()
            .await
            .map_err(|error| RpcFailure::retryable("cache.io", error.to_string()))?;
        drop(file);
        tokio::fs::rename(&temporary, &target)
            .await
            .map_err(|error| RpcFailure::retryable("cache.io", error.to_string()))?;
        Ok(target.clone())
    }
    .await;

    if result.is_err() {
        let _ = tokio::fs::remove_file(&temporary).await;
    }
    result
}

async fn serve_file(
    path: &Path,
    format: Option<&str>,
    candidate_id: &str,
    range: Option<&HeaderValue>,
) -> Response {
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
        .header(header::CONTENT_TYPE, media_mime_type(format))
        .header(header::CONTENT_LENGTH, response_length)
        .header(header::ACCEPT_RANGES, "bytes")
        // Offline clients key immutable bytes by the actual resolved candidate rather than
        // the track ID. A later fidelity upgrade therefore selects a new cache object.
        .header("x-pyxis-candidate-id", candidate_id);
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

fn format_matches_selected(format: Option<&str>, selected_format: Option<&str>) -> bool {
    let Some(selected) = selected_format else {
        return true;
    };
    let Some(format) = format else {
        return false;
    };
    let format = format.to_ascii_lowercase();
    let selected = selected.to_ascii_lowercase();
    format == selected || format.starts_with(&format!("{selected}/"))
}

pub(crate) fn media_mime_type(format: Option<&str>) -> &'static str {
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

#[cfg(test)]
mod output_token_tests {
    use super::*;

    #[test]
    fn media_mime_mapping_is_shared_by_http_and_output_metadata() {
        assert_eq!(media_mime_type(Some("aac")), "audio/mp4");
        assert_eq!(media_mime_type(Some("webm/opus")), "audio/webm");
        assert_eq!(media_mime_type(Some("flac")), "audio/flac");
    }

    #[test]
    fn output_tokens_are_bound_to_account_track_candidate_and_process_lifetime() {
        let tokens = OutputStreamTokens::default();
        let account = AccountId::new("default");
        let token = tokens.mint(
            &account,
            "track-1",
            "candidate-1",
            &["m4a".to_string()],
            Some("m4a/mp4a.40.2"),
        );

        assert_eq!(
            tokens.authorize(&token, "track-1"),
            Some((
                account,
                "candidate-1".into(),
                vec!["m4a".into()],
                Some("m4a/mp4a.40.2".into()),
            ))
        );
        assert!(tokens.authorize(&token, "track-2").is_none());
        assert!(OutputStreamTokens::default()
            .authorize(&token, "track-1")
            .is_none());
    }
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
