//! Remote stream resolution payloads and atomic upstream fetch.

use std::collections::HashMap;
use std::path::PathBuf;

use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, CONTENT_RANGE, RANGE};
use serde::Deserialize;
use tokio::io::AsyncWriteExt;

use super::cache::StreamCache;

pub const MAX_STREAM_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const RANGE_PROBE_BYTES: u64 = 1024;
const FETCH_CHUNK_BYTES: u64 = 1024 * 1024;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RemoteStreamDescriptor {
    pub kind: String,
    pub url: String,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    pub format: Option<String>,
    pub bitrate_kbps: Option<f64>,
    pub sample_rate_hz: Option<u32>,
    pub lossless: bool,
}

#[derive(Debug, thiserror::Error)]
pub enum ProxyError {
    #[error("plugin stream payload is invalid: {0}")]
    InvalidDescriptor(String),
    #[error("upstream request failed: {0}")]
    Request(String),
    #[error("upstream returned HTTP {0}")]
    Status(u16),
    #[error("upstream stream exceeded {MAX_STREAM_BYTES} bytes")]
    TooLarge,
    #[error("upstream returned an empty audio response")]
    Empty,
    #[error("upstream returned an invalid Content-Range: {0}")]
    InvalidRange(String),
    #[error("stream cache I/O failed: {0}")]
    Io(#[from] std::io::Error),
}

impl ProxyError {
    pub fn code(&self) -> &'static str {
        match self {
            ProxyError::InvalidDescriptor(_) => "plugin.invalidStream",
            ProxyError::Request(_) => "upstream.request",
            ProxyError::Status(_) => "upstream.status",
            ProxyError::TooLarge => "upstream.tooLarge",
            ProxyError::Empty => "upstream.empty",
            ProxyError::InvalidRange(_) => "upstream.invalidRange",
            ProxyError::Io(_) => "cache.io",
        }
    }

    pub fn retryable(&self) -> bool {
        matches!(
            self,
            ProxyError::Request(_)
                | ProxyError::Status(429 | 500..=599)
                | ProxyError::InvalidRange(_)
                | ProxyError::Io(_)
        )
    }
}

pub async fn fetch_to_cache(
    cache: &StreamCache,
    key: &str,
    descriptor: &RemoteStreamDescriptor,
    client: &reqwest::Client,
) -> Result<PathBuf, ProxyError> {
    if descriptor.kind != "remote" || descriptor.url.is_empty() {
        return Err(ProxyError::InvalidDescriptor(
            "expected kind=remote and a non-empty URL".into(),
        ));
    }
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
    let result = fetch_chunks(&temporary, descriptor, client).await;
    match result {
        Ok(()) => {
            tokio::fs::rename(&temporary, &target).await?;
            Ok(target)
        }
        Err(error) => {
            let _ = tokio::fs::remove_file(&temporary).await;
            Err(error)
        }
    }
}

async fn fetch_chunks(
    temporary: &std::path::Path,
    descriptor: &RemoteStreamDescriptor,
    client: &reqwest::Client,
) -> Result<(), ProxyError> {
    let headers = descriptor_headers(descriptor)?;
    let mut file = tokio::fs::File::create(temporary).await?;
    let mut start = 0_u64;
    let mut expected_total = None;

    loop {
        let window = if expected_total.is_none() {
            RANGE_PROBE_BYTES
        } else {
            FETCH_CHUNK_BYTES
        };
        let requested_end = start
            .saturating_add(window - 1)
            .min(expected_total.map_or(MAX_STREAM_BYTES, |total| total - 1));
        let response = client
            .get(&descriptor.url)
            .headers(headers.clone())
            // Google media endpoints reject an unbounded GET. A bounded range also lets
            // the cache make progress without holding a multi-gigabyte response open.
            .header(RANGE, format!("bytes={start}-{requested_end}"))
            .send()
            .await
            .map_err(|error| ProxyError::Request(error.to_string()))?;
        let status = response.status();
        if !status.is_success() {
            return Err(ProxyError::Status(status.as_u16()));
        }

        let range = if status == reqwest::StatusCode::PARTIAL_CONTENT {
            let value = response
                .headers()
                .get(CONTENT_RANGE)
                .and_then(|value| value.to_str().ok())
                .ok_or_else(|| ProxyError::InvalidRange("missing Content-Range".into()))?;
            Some(parse_content_range(value)?)
        } else if start == 0 {
            None
        } else {
            return Err(ProxyError::InvalidRange(format!(
                "server returned {status} after ranged offset {start}"
            )));
        };

        if let Some((range_start, _, total)) = range {
            if range_start != start {
                return Err(ProxyError::InvalidRange(format!(
                    "expected range to start at {start}, got {range_start}"
                )));
            }
            if total > MAX_STREAM_BYTES {
                return Err(ProxyError::TooLarge);
            }
            if expected_total
                .replace(total)
                .is_some_and(|seen| seen != total)
            {
                return Err(ProxyError::InvalidRange(
                    "total length changed between chunks".into(),
                ));
            }
        } else if response
            .content_length()
            .is_some_and(|length| length > MAX_STREAM_BYTES)
        {
            return Err(ProxyError::TooLarge);
        }

        let mut written = 0_u64;
        let mut stream = response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|error| ProxyError::Request(error.to_string()))?;
            written += u64::try_from(chunk.len()).unwrap_or(u64::MAX);
            if start.saturating_add(written) > MAX_STREAM_BYTES {
                return Err(ProxyError::TooLarge);
            }
            file.write_all(&chunk).await?;
        }
        if written == 0 {
            return Err(ProxyError::Empty);
        }
        start += written;

        match range {
            None => break,
            Some((_, range_end, total)) => {
                if start != range_end + 1 {
                    return Err(ProxyError::InvalidRange(format!(
                        "range ended at {range_end} but delivered through {}",
                        start.saturating_sub(1)
                    )));
                }
                if start >= total {
                    break;
                }
            }
        }
    }

    if expected_total.is_some_and(|total| total != start) {
        return Err(ProxyError::InvalidRange(format!(
            "expected {expected_total:?} bytes, wrote {start}"
        )));
    }
    file.sync_all().await?;
    Ok(())
}

fn descriptor_headers(descriptor: &RemoteStreamDescriptor) -> Result<HeaderMap, ProxyError> {
    let mut headers = HeaderMap::new();
    for (name, value) in &descriptor.headers {
        let name = HeaderName::from_bytes(name.as_bytes()).map_err(|error| {
            ProxyError::InvalidDescriptor(format!("invalid header name '{name}': {error}"))
        })?;
        if name == RANGE {
            continue;
        }
        let value = HeaderValue::from_str(value).map_err(|error| {
            ProxyError::InvalidDescriptor(format!("invalid value for '{name}': {error}"))
        })?;
        headers.insert(name, value);
    }
    Ok(headers)
}

fn parse_content_range(value: &str) -> Result<(u64, u64, u64), ProxyError> {
    let value = value
        .strip_prefix("bytes ")
        .ok_or_else(|| ProxyError::InvalidRange(value.into()))?;
    let (bounds, total) = value
        .split_once('/')
        .ok_or_else(|| ProxyError::InvalidRange(value.into()))?;
    let (start, end) = bounds
        .split_once('-')
        .ok_or_else(|| ProxyError::InvalidRange(value.into()))?;
    let start = start
        .parse::<u64>()
        .map_err(|_| ProxyError::InvalidRange(value.into()))?;
    let end = end
        .parse::<u64>()
        .map_err(|_| ProxyError::InvalidRange(value.into()))?;
    let total = total
        .parse::<u64>()
        .map_err(|_| ProxyError::InvalidRange(value.into()))?;
    if start > end || end >= total {
        return Err(ProxyError::InvalidRange(value.into()));
    }
    Ok((start, end, total))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_content_range() {
        assert_eq!(
            parse_content_range("bytes 0-1023/4096").unwrap(),
            (0, 1023, 4096)
        );
    }

    #[test]
    fn rejects_impossible_content_range() {
        assert!(parse_content_range("bytes 10-5/20").is_err());
        assert!(parse_content_range("bytes 0-20/20").is_err());
    }
}
