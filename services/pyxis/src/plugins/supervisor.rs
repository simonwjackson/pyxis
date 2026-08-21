//! One supervisor thread per plugin process.
//!
//! The thread owns the child, stdin and stdout reader. Calls are sequential in v1. A
//! timeout or malformed response kills that process, fails only that call, then restarts
//! the plugin with backoff. Three crashes inside the policy window quarantine it instead
//! of restart-looping forever.

use std::collections::VecDeque;
use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::thread;
use std::time::{Duration, Instant};

use serde_json::Value;
use ulid::Ulid;

use super::host::PluginCandidate;
use super::protocol::{
    PluginCallOutcome, PluginCapability, PluginCapabilityCall, PluginHandshakeOutcome,
    PluginHandshakeRequest, PluginManifest, PluginRequest, PluginRequestEnvelope, PluginResponse,
    PluginResponseEnvelope, PluginValue, PLUGIN_PROTOCOL_VERSION,
};
use super::registry::{PluginInfo, PluginRegistry, PluginStatus};

#[derive(Debug, Clone)]
pub struct HostPolicy {
    pub handshake_timeout: Duration,
    pub call_timeout: Duration,
    pub restart_backoff: Duration,
    pub quarantine_after: usize,
    pub quarantine_window: Duration,
}

impl Default for HostPolicy {
    fn default() -> Self {
        HostPolicy {
            handshake_timeout: Duration::from_secs(5),
            call_timeout: Duration::from_secs(30),
            restart_backoff: Duration::from_secs(1),
            quarantine_after: 3,
            quarantine_window: Duration::from_secs(60),
        }
    }
}

#[derive(Debug, thiserror::Error, PartialEq)]
pub enum PluginCallError {
    #[error("plugin '{plugin_id}' is unavailable: {reason}")]
    Unavailable { plugin_id: String, reason: String },
    #[error("plugin '{plugin_id}' does not declare capability '{capability}'")]
    CapabilityUnavailable {
        plugin_id: String,
        capability: String,
    },
    #[error("plugin '{plugin_id}' process exited during '{operation}'")]
    ProcessExited {
        plugin_id: String,
        operation: String,
    },
    #[error("plugin '{plugin_id}' timed out during '{operation}'")]
    Timeout {
        plugin_id: String,
        operation: String,
    },
    #[error("plugin '{plugin_id}' returned an invalid response: {message}")]
    Protocol { plugin_id: String, message: String },
    #[error("plugin '{plugin_id}' rejected '{operation}': {code}: {message}")]
    Plugin {
        plugin_id: String,
        operation: String,
        code: String,
        message: String,
        retryable: bool,
    },
}

pub enum SupervisorCommand {
    Call {
        capability: PluginCapability,
        operation: String,
        input: Value,
        reply: Sender<Result<Value, PluginCallError>>,
    },
    Shutdown,
}

pub struct StartedSupervisor {
    pub id: String,
    pub commands: Sender<SupervisorCommand>,
}

pub enum StartOutcome {
    Started(StartedSupervisor),
    Refused(PluginInfo),
}

const MAX_PROTOCOL_LINE_BYTES: usize = 1024 * 1024;

enum ProcessOutput {
    Line(String),
    TooLarge,
}

struct RunningPlugin {
    child: Child,
    stdin: ChildStdin,
    output: Receiver<ProcessOutput>,
    manifest: PluginManifest,
}

#[derive(Debug)]
struct StartFailure {
    manifest: Option<Box<PluginManifest>>,
    reason: String,
}

pub fn start(
    candidate: PluginCandidate,
    policy: HostPolicy,
    registry: PluginRegistry,
) -> StartOutcome {
    let running = match spawn_and_handshake(&candidate, policy.handshake_timeout) {
        Ok(running) => running,
        Err(failure) => {
            let mut info = failure
                .manifest
                .as_deref()
                .map(|manifest| PluginInfo::from_manifest(manifest, PluginStatus::Refused))
                .unwrap_or_else(|| candidate.fallback_info(PluginStatus::Refused));
            info.reason = Some(failure.reason);
            return StartOutcome::Refused(info);
        }
    };

    let id = running.manifest.id.clone();
    registry.upsert(PluginInfo::from_manifest(
        &running.manifest,
        PluginStatus::Live,
    ));
    let (commands, receiver) = mpsc::channel();
    let thread_id = id.clone();
    thread::Builder::new()
        .name(format!("pyxis-plugin-{thread_id}"))
        .spawn(move || supervise(candidate, policy, registry, receiver, running))
        .expect("start plugin supervisor thread");

    StartOutcome::Started(StartedSupervisor { id, commands })
}

fn supervise(
    candidate: PluginCandidate,
    policy: HostPolicy,
    registry: PluginRegistry,
    commands: Receiver<SupervisorCommand>,
    initial: RunningPlugin,
) {
    let id = initial.manifest.id.clone();
    let mut running = initial;
    let mut failures = VecDeque::new();

    loop {
        match commands.recv_timeout(Duration::from_millis(10)) {
            Ok(SupervisorCommand::Shutdown) | Err(RecvTimeoutError::Disconnected) => {
                stop(&mut running);
                registry.set_status(&id, PluginStatus::Stopped, None);
                return;
            }
            Ok(SupervisorCommand::Call {
                capability,
                operation,
                input,
                reply,
            }) => {
                let outcome = call_process(
                    &mut running,
                    &id,
                    capability,
                    &operation,
                    input,
                    policy.call_timeout,
                );
                let process_failed = matches!(
                    outcome,
                    Err(PluginCallError::ProcessExited { .. })
                        | Err(PluginCallError::Timeout { .. })
                        | Err(PluginCallError::Protocol { .. })
                );
                // Publish the dead-process state before waking the caller. Otherwise a
                // caller can receive ProcessExited, immediately inspect the registry, and
                // still see `live` for the process that just died.
                if process_failed {
                    registry.set_status(
                        &id,
                        PluginStatus::Restarting,
                        Some("plugin process failed during a call".into()),
                    );
                }
                let _ = reply.send(outcome);
                if process_failed
                    && !restart(
                        &candidate,
                        &policy,
                        &registry,
                        &id,
                        &mut running,
                        &mut failures,
                    )
                {
                    return;
                }
            }
            Err(RecvTimeoutError::Timeout) => match running.child.try_wait() {
                Ok(Some(status)) => {
                    let reason = format!("plugin process crashed with {status}");
                    if !restart_after_failure(
                        &candidate,
                        &policy,
                        &registry,
                        &id,
                        reason,
                        &mut running,
                        &mut failures,
                    ) {
                        return;
                    }
                }
                Ok(None) => {}
                Err(error) => {
                    let reason = format!("could not inspect plugin process: {error}");
                    if !restart_after_failure(
                        &candidate,
                        &policy,
                        &registry,
                        &id,
                        reason,
                        &mut running,
                        &mut failures,
                    ) {
                        return;
                    }
                }
            },
        }
    }
}

fn restart(
    candidate: &PluginCandidate,
    policy: &HostPolicy,
    registry: &PluginRegistry,
    id: &str,
    running: &mut RunningPlugin,
    failures: &mut VecDeque<Instant>,
) -> bool {
    restart_after_failure(
        candidate,
        policy,
        registry,
        id,
        "plugin process failed during a call".into(),
        running,
        failures,
    )
}

#[allow(clippy::too_many_arguments)]
fn restart_after_failure(
    candidate: &PluginCandidate,
    policy: &HostPolicy,
    registry: &PluginRegistry,
    id: &str,
    reason: String,
    running: &mut RunningPlugin,
    failures: &mut VecDeque<Instant>,
) -> bool {
    stop(running);
    let now = Instant::now();
    failures.push_back(now);
    while failures
        .front()
        .is_some_and(|failure| now.duration_since(*failure) > policy.quarantine_window)
    {
        failures.pop_front();
    }
    if failures.len() >= policy.quarantine_after {
        registry.set_status(
            id,
            PluginStatus::Quarantined,
            Some(format!(
                "{reason}; {} crashes inside {:?}",
                failures.len(),
                policy.quarantine_window
            )),
        );
        return false;
    }

    registry.set_status(id, PluginStatus::Restarting, Some(reason));
    thread::sleep(policy.restart_backoff);

    loop {
        match spawn_and_handshake(candidate, policy.handshake_timeout) {
            Ok(next) if next.manifest.id == id => {
                *running = next;
                registry.set_status(id, PluginStatus::Live, None);
                return true;
            }
            Ok(mut next) => {
                let changed = next.manifest.id.clone();
                stop(&mut next);
                registry.set_status(
                    id,
                    PluginStatus::Refused,
                    Some(format!(
                        "plugin id changed from '{id}' to '{changed}' on restart"
                    )),
                );
                return false;
            }
            Err(failure) => {
                let now = Instant::now();
                failures.push_back(now);
                while failures
                    .front()
                    .is_some_and(|failure| now.duration_since(*failure) > policy.quarantine_window)
                {
                    failures.pop_front();
                }
                if failures.len() >= policy.quarantine_after {
                    registry.set_status(
                        id,
                        PluginStatus::Quarantined,
                        Some(format!(
                            "{}; {} crashes inside {:?}",
                            failure.reason,
                            failures.len(),
                            policy.quarantine_window
                        )),
                    );
                    return false;
                }
                registry.set_status(id, PluginStatus::Restarting, Some(failure.reason));
                thread::sleep(policy.restart_backoff);
            }
        }
    }
}

fn call_process(
    running: &mut RunningPlugin,
    plugin_id: &str,
    capability: PluginCapability,
    operation: &str,
    input: Value,
    timeout: Duration,
) -> Result<Value, PluginCallError> {
    if !running.manifest.capabilities.contains(&capability) {
        return Err(PluginCallError::CapabilityUnavailable {
            plugin_id: plugin_id.into(),
            capability: capability.as_str().into(),
        });
    }

    let id = Ulid::new().to_string();
    let envelope = PluginRequestEnvelope {
        id: id.clone(),
        request: PluginRequest::CapabilityCall(PluginCapabilityCall {
            capability,
            operation: operation.to_string(),
            input: PluginValue::from(input),
        }),
    };
    if write_line(&mut running.stdin, &envelope).is_err() {
        return Err(PluginCallError::ProcessExited {
            plugin_id: plugin_id.into(),
            operation: operation.into(),
        });
    }

    let line = match running.output.recv_timeout(timeout) {
        Ok(ProcessOutput::Line(line)) => line,
        Ok(ProcessOutput::TooLarge) => {
            return Err(PluginCallError::Protocol {
                plugin_id: plugin_id.into(),
                message: format!("response exceeded {MAX_PROTOCOL_LINE_BYTES} byte protocol limit"),
            });
        }
        Err(RecvTimeoutError::Timeout) => {
            let _ = running.child.kill();
            return Err(PluginCallError::Timeout {
                plugin_id: plugin_id.into(),
                operation: operation.into(),
            });
        }
        Err(RecvTimeoutError::Disconnected) => {
            return Err(PluginCallError::ProcessExited {
                plugin_id: plugin_id.into(),
                operation: operation.into(),
            });
        }
    };
    let response: PluginResponseEnvelope =
        serde_json::from_str(&line).map_err(|error| PluginCallError::Protocol {
            plugin_id: plugin_id.into(),
            message: error.to_string(),
        })?;
    if response.id != id {
        return Err(PluginCallError::Protocol {
            plugin_id: plugin_id.into(),
            message: format!("expected response id '{id}', got '{}'", response.id),
        });
    }

    match response.response {
        PluginResponse::CapabilityCall(PluginCallOutcome::Ready(value)) => Ok(value.into()),
        PluginResponse::CapabilityCall(PluginCallOutcome::Unavailable(failure)) => {
            Err(PluginCallError::Plugin {
                plugin_id: plugin_id.into(),
                operation: operation.into(),
                code: failure.code,
                message: failure.message,
                retryable: failure.retryable,
            })
        }
        PluginResponse::Handshake(_) => Err(PluginCallError::Protocol {
            plugin_id: plugin_id.into(),
            message: "received a handshake response for a capability call".into(),
        }),
    }
}

fn spawn_and_handshake(
    candidate: &PluginCandidate,
    timeout: Duration,
) -> Result<RunningPlugin, StartFailure> {
    let mut command = Command::new(&candidate.path);
    command
        .envs(&candidate.env)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        // Plugin diagnostics gain a structured protocol later. Until then, discarding
        // stderr is safer than letting an untrusted process allocate unbounded log lines
        // or flood the service journal.
        .stderr(Stdio::null());
    let mut child = command.spawn().map_err(|error| StartFailure {
        manifest: None,
        reason: format!("could not start {}: {error}", candidate.path.display()),
    })?;
    let mut stdin = child.stdin.take().expect("piped stdin");
    let stdout = child.stdout.take().expect("piped stdout");
    let (output_tx, output) = mpsc::channel();
    thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        loop {
            let mut line = String::new();
            let read = match (&mut reader)
                .take((MAX_PROTOCOL_LINE_BYTES + 1) as u64)
                .read_line(&mut line)
            {
                Ok(read) => read,
                Err(_) => break,
            };
            if read == 0 {
                break;
            }
            if read > MAX_PROTOCOL_LINE_BYTES || !line.ends_with('\n') {
                let _ = output_tx.send(ProcessOutput::TooLarge);
                break;
            }
            if output_tx.send(ProcessOutput::Line(line)).is_err() {
                break;
            }
        }
    });

    let id = Ulid::new().to_string();
    let request = PluginRequestEnvelope {
        id: id.clone(),
        request: PluginRequest::Handshake(PluginHandshakeRequest {
            protocol_version: PLUGIN_PROTOCOL_VERSION,
        }),
    };
    if let Err(error) = write_line(&mut stdin, &request) {
        let _ = child.kill();
        return Err(StartFailure {
            manifest: None,
            reason: format!("could not send handshake: {error}"),
        });
    }
    let line = match output.recv_timeout(timeout) {
        Ok(ProcessOutput::Line(line)) => line,
        Ok(ProcessOutput::TooLarge) => {
            let _ = child.kill();
            return Err(StartFailure {
                manifest: None,
                reason: format!("handshake exceeded {MAX_PROTOCOL_LINE_BYTES} byte protocol limit"),
            });
        }
        Err(error) => {
            let _ = child.kill();
            return Err(StartFailure {
                manifest: None,
                reason: format!("handshake did not complete: {error}"),
            });
        }
    };
    let response: PluginResponseEnvelope = match serde_json::from_str(&line) {
        Ok(response) => response,
        Err(error) => {
            let _ = child.kill();
            return Err(StartFailure {
                manifest: None,
                reason: format!("invalid handshake response: {error}"),
            });
        }
    };
    if response.id != id {
        let _ = child.kill();
        return Err(StartFailure {
            manifest: None,
            reason: format!(
                "handshake correlation id was '{}', expected '{id}'",
                response.id
            ),
        });
    }

    let manifest = match response.response {
        PluginResponse::Handshake(PluginHandshakeOutcome::Ready(manifest)) => manifest,
        PluginResponse::Handshake(PluginHandshakeOutcome::Rejected(failure)) => {
            let _ = child.kill();
            return Err(StartFailure {
                manifest: None,
                reason: format!("{}: {}", failure.code, failure.message),
            });
        }
        PluginResponse::CapabilityCall(_) => {
            let _ = child.kill();
            return Err(StartFailure {
                manifest: None,
                reason: "received capability response during handshake".into(),
            });
        }
    };
    if manifest.protocol_version != PLUGIN_PROTOCOL_VERSION {
        let _ = child.kill();
        return Err(StartFailure {
            reason: format!(
                "plugin protocol version {} does not match core version {}",
                manifest.protocol_version, PLUGIN_PROTOCOL_VERSION
            ),
            manifest: Some(Box::new(manifest)),
        });
    }

    Ok(RunningPlugin {
        child,
        stdin,
        output,
        manifest,
    })
}

fn write_line<T: serde::Serialize>(writer: &mut ChildStdin, value: &T) -> std::io::Result<()> {
    serde_json::to_writer(&mut *writer, value)?;
    writer.write_all(b"\n")?;
    writer.flush()
}

fn stop(running: &mut RunningPlugin) {
    let _ = running.child.kill();
    let _ = running.child.wait();
}
