//! Configurable real plugin process used by the host acceptance suite.
//!
//! It speaks the exact public protocol. Behavior comes from environment variables so the
//! same implementation can be healthy, mismatched, slow or crash-prone without separate
//! faux plugin types.

use std::collections::BTreeMap;
use std::io::{self, BufRead, Write};
use std::path::PathBuf;
use std::time::Duration;

use pyxis::plugins::protocol::{
    PluginCallOutcome, PluginCapability, PluginFailure, PluginHandshakeOutcome, PluginManifest,
    PluginRequest, PluginRequestEnvelope, PluginResponse, PluginResponseEnvelope, PluginValue,
    PLUGIN_PROTOCOL_VERSION,
};

fn main() -> anyhow::Result<()> {
    let id = std::env::var("PYXIS_LAB_ID").unwrap_or_else(|_| "laboratory".into());
    let behavior = std::env::var("PYXIS_LAB_BEHAVIOR").unwrap_or_else(|_| "ready".into());
    let stdin = io::stdin();
    let mut lines = stdin.lock().lines();
    let mut stdout = io::stdout().lock();

    let handshake = next_request(&mut lines)?;
    let PluginRequest::Handshake(_) = handshake.request else {
        anyhow::bail!("first request was not a handshake");
    };
    let manifest = PluginManifest {
        id: id.clone(),
        name: format!("Laboratory {id}"),
        version: "1.0.0".into(),
        protocol_version: if behavior == "mismatch" {
            PLUGIN_PROTOCOL_VERSION + 1
        } else {
            PLUGIN_PROTOCOL_VERSION
        },
        capabilities: vec![PluginCapability::Source],
        config_schema: PluginValue::Object(BTreeMap::new()),
    };
    send(
        &mut stdout,
        PluginResponseEnvelope {
            id: handshake.id,
            response: PluginResponse::Handshake(PluginHandshakeOutcome::Ready(manifest)),
        },
    )?;

    if behavior == "mismatch" {
        return Ok(());
    }
    if behavior == "crash-after-handshake" {
        std::process::exit(23);
    }

    let mut stream_resolutions = 0_u32;
    for line in lines {
        let envelope: PluginRequestEnvelope = serde_json::from_str(&line?)?;
        let PluginRequest::CapabilityCall(call) = envelope.request else {
            anyhow::bail!("received a second handshake");
        };

        match behavior.as_str() {
            "hang" => std::thread::sleep(Duration::from_secs(10)),
            "oversized" => {
                stdout.write_all(&vec![b'x'; 1024 * 1024 + 1])?;
                stdout.write_all(b"\n")?;
                stdout.flush()?;
                continue;
            }
            "crash-once" => {
                let marker = PathBuf::from(std::env::var("PYXIS_LAB_MARKER")?);
                if !marker.exists() {
                    std::fs::write(marker, b"crashed")?;
                    std::process::exit(24);
                }
            }
            _ => {}
        }

        let mut value = BTreeMap::new();
        if call.operation == "search" {
            if let Ok(search) = std::env::var("PYXIS_LAB_SEARCH") {
                let fields: Vec<_> = search.split('|').collect();
                if fields.len() == 4 {
                    let mut track = BTreeMap::new();
                    track.insert("source".into(), PluginValue::String(id.clone()));
                    track.insert(
                        "externalId".into(),
                        PluginValue::String("laboratory-track".into()),
                    );
                    track.insert("title".into(), PluginValue::String(fields[0].into()));
                    track.insert("artist".into(), PluginValue::String(fields[1].into()));
                    track.insert("album".into(), PluginValue::String(fields[2].into()));
                    track.insert(
                        "durationMs".into(),
                        PluginValue::Unsigned(fields[3].parse()?),
                    );
                    value.insert(
                        "tracks".into(),
                        PluginValue::Array(vec![PluginValue::Object(track)]),
                    );
                }
            }
        }
        if call.operation == "album.search" {
            if let Ok(album) = std::env::var("PYXIS_LAB_ALBUM") {
                let fields: Vec<_> = album.split('|').collect();
                if fields.len() == 3 {
                    let mut summary = BTreeMap::new();
                    summary.insert("externalId".into(), PluginValue::String(fields[0].into()));
                    summary.insert("title".into(), PluginValue::String(fields[1].into()));
                    summary.insert("artist".into(), PluginValue::String(fields[2].into()));
                    value.insert(
                        "albums".into(),
                        PluginValue::Array(vec![PluginValue::Object(summary)]),
                    );
                }
            }
        }
        if call.operation == "album.get" && behavior == "album-permanent" {
            send(
                &mut stdout,
                PluginResponseEnvelope {
                    id: envelope.id,
                    response: PluginResponse::CapabilityCall(PluginCallOutcome::Unavailable(
                        PluginFailure {
                            code: "album.permanent".into(),
                            message: "album cannot be loaded".into(),
                            retryable: false,
                        },
                    )),
                },
            )?;
            continue;
        }
        if call.operation == "album.get" {
            if let Ok(album) = std::env::var("PYXIS_LAB_ALBUM") {
                let fields: Vec<_> = album.split('|').collect();
                if fields.len() == 3 {
                    value.insert("externalId".into(), PluginValue::String(fields[0].into()));
                    value.insert("title".into(), PluginValue::String(fields[1].into()));
                    value.insert("artist".into(), PluginValue::String(fields[2].into()));
                    let mut track = BTreeMap::new();
                    track.insert(
                        "externalId".into(),
                        PluginValue::String("album-track".into()),
                    );
                    track.insert("title".into(), PluginValue::String("Track One".into()));
                    track.insert("artist".into(), PluginValue::String(fields[2].into()));
                    track.insert("trackNumber".into(), PluginValue::Unsigned(1));
                    let tracks = if std::env::var("PYXIS_LAB_ALBUM_MODE").as_deref()
                        == Ok("duplicate-track")
                    {
                        vec![
                            PluginValue::Object(track.clone()),
                            PluginValue::Object(track),
                        ]
                    } else {
                        vec![PluginValue::Object(track)]
                    };
                    value.insert("tracks".into(), PluginValue::Array(tracks));
                }
            }
        }
        if call.operation == "stream.fetch" {
            if let (Ok(bytes), PluginValue::Object(input)) =
                (std::env::var("PYXIS_LAB_FETCH_BYTES"), &call.input)
            {
                if let Some(PluginValue::String(target_path)) = input.get("targetPath") {
                    std::fs::write(target_path, bytes.as_bytes())?;
                    value.insert("kind".into(), PluginValue::String("local".into()));
                    value.insert(
                        "targetPath".into(),
                        PluginValue::String(target_path.clone()),
                    );
                }
            }
        }
        if call.operation == "stream.resolve" {
            if let Ok(first) = std::env::var("PYXIS_LAB_STREAM_URL") {
                let url = if stream_resolutions == 0 {
                    first
                } else {
                    std::env::var("PYXIS_LAB_STREAM_URL_SECOND").unwrap_or(first)
                };
                stream_resolutions += 1;
                value.insert("kind".into(), PluginValue::String("remote".into()));
                value.insert("url".into(), PluginValue::String(url));
                value.insert("headers".into(), PluginValue::Object(BTreeMap::new()));
                value.insert("format".into(), PluginValue::String("webm/opus".into()));
                value.insert("lossless".into(), PluginValue::Bool(false));
            }
        }
        if value.is_empty() {
            value.insert("pluginId".into(), PluginValue::String(id.clone()));
            value.insert("operation".into(), PluginValue::String(call.operation));
            value.insert("input".into(), call.input);
        }
        send(
            &mut stdout,
            PluginResponseEnvelope {
                id: envelope.id,
                response: PluginResponse::CapabilityCall(PluginCallOutcome::Ready(
                    PluginValue::Object(value),
                )),
            },
        )?;
    }

    Ok(())
}

fn next_request(
    lines: &mut impl Iterator<Item = io::Result<String>>,
) -> anyhow::Result<PluginRequestEnvelope> {
    let line = lines
        .next()
        .ok_or_else(|| anyhow::anyhow!("stdin closed before handshake"))??;
    Ok(serde_json::from_str(&line)?)
}

fn send(stdout: &mut impl Write, response: PluginResponseEnvelope) -> anyhow::Result<()> {
    serde_json::to_writer(&mut *stdout, &response)?;
    stdout.write_all(b"\n")?;
    stdout.flush()?;
    Ok(())
}
