use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use serde::Deserialize;

use super::Fidelity;

const MAX_PROBE_JSON_BYTES: u64 = 256 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProbedAudio {
    pub format: String,
    pub fidelity: Fidelity,
    pub duration_ms: Option<u32>,
}

#[derive(Debug, thiserror::Error)]
pub enum ProbeError {
    #[error("could not start ffprobe: {0}")]
    Spawn(#[source] std::io::Error),
    #[error("ffprobe timed out")]
    Timeout,
    #[error("ffprobe rejected the file")]
    Rejected,
    #[error("ffprobe returned invalid metadata: {0}")]
    Invalid(String),
    #[error("could not read ffprobe output: {0}")]
    Io(#[from] std::io::Error),
}

pub trait AudioProbe: Send + Sync {
    fn probe(&self, path: &Path) -> Result<ProbedAudio, ProbeError>;
}

#[derive(Debug, Clone)]
pub struct FfprobeAudioProbe {
    binary: PathBuf,
    timeout: Duration,
}

impl Default for FfprobeAudioProbe {
    fn default() -> Self {
        FfprobeAudioProbe {
            binary: PathBuf::from("ffprobe"),
            timeout: Duration::from_secs(15),
        }
    }
}

impl FfprobeAudioProbe {
    #[cfg(test)]
    pub fn with_binary(binary: PathBuf, timeout: Duration) -> Self {
        FfprobeAudioProbe { binary, timeout }
    }
}

impl AudioProbe for FfprobeAudioProbe {
    fn probe(&self, path: &Path) -> Result<ProbedAudio, ProbeError> {
        let mut child = Command::new(&self.binary)
            .args([
                "-v",
                "error",
                "-show_entries",
                "format=format_name,duration,bit_rate:stream=codec_type,codec_name,sample_rate,bit_rate,bits_per_raw_sample",
                "-of",
                "json",
            ])
            .arg(path)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(ProbeError::Spawn)?;

        let started = Instant::now();
        let status = loop {
            if let Some(status) = child.try_wait()? {
                break status;
            }
            if started.elapsed() >= self.timeout {
                let _ = child.kill();
                let _ = child.wait();
                return Err(ProbeError::Timeout);
            }
            thread::sleep(Duration::from_millis(20));
        };
        if !status.success() {
            return Err(ProbeError::Rejected);
        }

        let mut stdout = child
            .stdout
            .take()
            .ok_or_else(|| ProbeError::Invalid("stdout was not captured".into()))?;
        let mut bytes = Vec::new();
        stdout
            .by_ref()
            .take(MAX_PROBE_JSON_BYTES + 1)
            .read_to_end(&mut bytes)?;
        if bytes.len() as u64 > MAX_PROBE_JSON_BYTES {
            return Err(ProbeError::Invalid(
                "metadata exceeded the size limit".into(),
            ));
        }
        decode_probe(&bytes)
    }
}

#[derive(Deserialize)]
struct ProbeOutput {
    #[serde(default)]
    streams: Vec<ProbeStream>,
    format: Option<ProbeFormat>,
}

#[derive(Deserialize)]
struct ProbeStream {
    codec_type: Option<String>,
    codec_name: Option<String>,
    sample_rate: Option<String>,
    bit_rate: Option<String>,
    bits_per_raw_sample: Option<String>,
}

#[derive(Deserialize)]
struct ProbeFormat {
    format_name: Option<String>,
    duration: Option<String>,
    bit_rate: Option<String>,
}

fn decode_probe(bytes: &[u8]) -> Result<ProbedAudio, ProbeError> {
    let value: ProbeOutput =
        serde_json::from_slice(bytes).map_err(|error| ProbeError::Invalid(error.to_string()))?;
    let stream = value
        .streams
        .iter()
        .find(|stream| stream.codec_type.as_deref() == Some("audio"))
        .ok_or_else(|| ProbeError::Invalid("file has no audio stream".into()))?;
    let codec = stream
        .codec_name
        .as_deref()
        .ok_or_else(|| ProbeError::Invalid("audio codec is missing".into()))?;
    let format = normalized_format(
        codec,
        value
            .format
            .as_ref()
            .and_then(|item| item.format_name.as_deref()),
    )
    .ok_or_else(|| ProbeError::Invalid(format!("unsupported audio codec '{codec}'")))?;
    let lossless = is_lossless(codec);
    let bitrate_kbps = parse_u64(stream.bit_rate.as_deref())
        .or_else(|| {
            parse_u64(
                value
                    .format
                    .as_ref()
                    .and_then(|item| item.bit_rate.as_deref()),
            )
        })
        .map(|bits| bits / 1000)
        .and_then(|value| u32::try_from(value).ok())
        .filter(|value| *value > 0);
    let sample_rate_hz = parse_u64(stream.sample_rate.as_deref())
        .and_then(|value| u32::try_from(value).ok())
        .filter(|value| *value > 0);
    let duration_ms = value
        .format
        .as_ref()
        .and_then(|item| item.duration.as_deref())
        .and_then(parse_duration_ms);
    let _bit_depth = parse_u64(stream.bits_per_raw_sample.as_deref());

    Ok(ProbedAudio {
        format: format.into(),
        fidelity: Fidelity {
            lossless,
            bitrate_kbps,
            sample_rate_hz,
        },
        duration_ms,
    })
}

fn parse_u64(value: Option<&str>) -> Option<u64> {
    value?.parse().ok()
}

fn parse_duration_ms(value: &str) -> Option<u32> {
    let seconds = value.parse::<f64>().ok()?;
    if !seconds.is_finite() || seconds <= 0.0 {
        return None;
    }
    u32::try_from((seconds * 1000.0).round() as u64).ok()
}

fn normalized_format(codec: &str, container: Option<&str>) -> Option<&'static str> {
    let codec = codec.to_ascii_lowercase();
    let containers = container
        .unwrap_or_default()
        .to_ascii_lowercase()
        .split(',')
        .map(str::to_string)
        .collect::<Vec<_>>();
    let has = |name: &str| containers.iter().any(|container| container == name);
    match codec.as_str() {
        "flac" if has("flac") => Some("flac"),
        "alac" if has("mov") || has("mp4") || has("m4a") => Some("m4a"),
        "mp3" if has("mp3") => Some("mp3"),
        "aac" if has("mov") || has("mp4") || has("m4a") => Some("m4a"),
        "aac" if has("aac") => Some("aac"),
        "opus" if has("ogg") || has("webm") => Some("opus"),
        "vorbis" if has("ogg") => Some("ogg"),
        value if value.starts_with("pcm_") && has("wav") => Some("wav"),
        _ => None,
    }
}

fn is_lossless(codec: &str) -> bool {
    let codec = codec.to_ascii_lowercase();
    codec == "flac" || codec == "alac" || codec.starts_with("pcm_")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_verified_lossless_audio() {
        let audio = decode_probe(
            br#"{"streams":[{"codec_type":"audio","codec_name":"flac","sample_rate":"96000","bit_rate":"1200000","bits_per_raw_sample":"24"}],"format":{"format_name":"flac","duration":"180.25","bit_rate":"1200000"}}"#,
        )
        .expect("probe");
        assert_eq!(audio.format, "flac");
        assert_eq!(audio.duration_ms, Some(180_250));
        assert_eq!(
            audio.fidelity,
            Fidelity {
                lossless: true,
                bitrate_kbps: Some(1200),
                sample_rate_hz: Some(96_000),
            }
        );
    }

    #[test]
    fn rejects_a_file_without_audio() {
        assert!(decode_probe(br#"{"streams":[],"format":{"format_name":"png"}}"#).is_err());
    }

    #[test]
    fn distinguishes_raw_aac_from_aac_in_mp4() {
        let raw = decode_probe(
            br#"{"streams":[{"codec_type":"audio","codec_name":"aac"}],"format":{"format_name":"aac"}}"#,
        )
        .expect("raw AAC");
        let m4a = decode_probe(
            br#"{"streams":[{"codec_type":"audio","codec_name":"aac"}],"format":{"format_name":"mov,mp4,m4a,3gp,3g2,mj2"}}"#,
        )
        .expect("M4A");
        assert_eq!(raw.format, "aac");
        assert_eq!(m4a.format, "m4a");
    }

    #[test]
    fn rejects_codec_container_mismatches() {
        assert!(decode_probe(
            br#"{"streams":[{"codec_type":"audio","codec_name":"flac"}],"format":{"format_name":"ogg"}}"#,
        )
        .is_err());
    }
}
