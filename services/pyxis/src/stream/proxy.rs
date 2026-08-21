//! Remote stream resolution payloads and atomic upstream fetch.

use std::collections::HashMap;
use std::path::PathBuf;

use futures_util::StreamExt;
use reqwest::header::{HeaderName, HeaderValue};
use serde::Deserialize;
use tokio::io::AsyncWriteExt;

use super::cache::StreamCache;

pub const MAX_STREAM_BYTES: u64 = 2 * 1024 * 1024 * 1024;

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
            ProxyError::Io(_) => "cache.io",
        }
    }

    pub fn retryable(&self) -> bool {
        matches!(
            self,
            ProxyError::Request(_) | ProxyError::Status(429 | 500..=599) | ProxyError::Io(_)
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
    let result = async {
        let mut request = client.get(&descriptor.url);
        for (name, value) in &descriptor.headers {
            let name = HeaderName::from_bytes(name.as_bytes()).map_err(|error| {
                ProxyError::InvalidDescriptor(format!("invalid header name '{name}': {error}"))
            })?;
            let value = HeaderValue::from_str(value).map_err(|error| {
                ProxyError::InvalidDescriptor(format!("invalid value for '{name}': {error}"))
            })?;
            request = request.header(name, value);
        }
        let response = request
            .send()
            .await
            .map_err(|error| ProxyError::Request(error.to_string()))?;
        if !response.status().is_success() {
            return Err(ProxyError::Status(response.status().as_u16()));
        }
        if response
            .content_length()
            .is_some_and(|length| length > MAX_STREAM_BYTES)
        {
            return Err(ProxyError::TooLarge);
        }

        let mut file = tokio::fs::File::create(&temporary).await?;
        let mut bytes_written = 0_u64;
        let mut stream = response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|error| ProxyError::Request(error.to_string()))?;
            bytes_written += u64::try_from(chunk.len()).unwrap_or(u64::MAX);
            if bytes_written > MAX_STREAM_BYTES {
                return Err(ProxyError::TooLarge);
            }
            file.write_all(&chunk).await?;
        }
        if bytes_written == 0 {
            return Err(ProxyError::Empty);
        }
        file.sync_all().await?;
        drop(file);
        tokio::fs::rename(&temporary, &target).await?;
        Ok(target.clone())
    }
    .await;

    if result.is_err() {
        let _ = tokio::fs::remove_file(&temporary).await;
    }
    result
}
