//! Plugin discovery and the stable in-process host interface.
//!
//! A candidate is an executable named `pyxis-plugin-*` found either in the configured
//! plugin directory or on PATH. The core never links plugin code and remains useful when
//! discovery finds nothing.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::Value;

use super::protocol::PluginCapability;
use super::registry::{PluginInfo, PluginRegistry, PluginStatus};
use super::supervisor::{self, PluginInvocation, StartOutcome, SupervisorCommand};
pub use super::supervisor::{HostPolicy, PluginCallError};

const PLUGIN_PREFIX: &str = "pyxis-plugin-";

#[derive(Debug, Clone)]
pub struct PluginCandidate {
    pub(crate) path: PathBuf,
    pub(crate) env: BTreeMap<OsString, OsString>,
}

impl PluginCandidate {
    pub fn new(path: PathBuf) -> Self {
        PluginCandidate {
            path,
            env: BTreeMap::new(),
        }
    }

    pub fn with_env(mut self, key: impl Into<OsString>, value: impl Into<OsString>) -> Self {
        self.env.insert(key.into(), value.into());
        self
    }

    pub(crate) fn fallback_info(&self, status: PluginStatus) -> PluginInfo {
        let id = self
            .path
            .file_name()
            .and_then(OsStr::to_str)
            .unwrap_or("unknown-plugin")
            .strip_prefix(PLUGIN_PREFIX)
            .unwrap_or("unknown-plugin")
            .to_string();
        PluginInfo {
            id: id.clone(),
            name: id,
            version: "unknown".into(),
            capabilities: Vec::new(),
            status,
            reason: None,
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum HostError {
    #[error("duplicate plugin id '{0}'")]
    DuplicateId(String),
}

#[derive(Clone)]
pub struct PluginHost {
    registry: PluginRegistry,
    commands: Arc<Mutex<HashMap<String, mpsc::Sender<SupervisorCommand>>>>,
    policy: HostPolicy,
}

impl PluginHost {
    pub fn empty() -> Self {
        PluginHost {
            registry: PluginRegistry::default(),
            commands: Arc::new(Mutex::new(HashMap::new())),
            policy: HostPolicy::default(),
        }
    }

    pub fn start(candidates: Vec<PluginCandidate>, policy: HostPolicy) -> Result<Self, HostError> {
        let host = PluginHost {
            registry: PluginRegistry::default(),
            commands: Arc::new(Mutex::new(HashMap::new())),
            policy: policy.clone(),
        };

        for candidate in candidates {
            match supervisor::start(candidate, policy.clone(), host.registry.clone()) {
                StartOutcome::Started(started) => {
                    let mut commands = host.commands.lock().expect("plugin host poisoned");
                    if commands.contains_key(&started.id) {
                        let _ = started.commands.send(SupervisorCommand::Shutdown);
                        return Err(HostError::DuplicateId(started.id));
                    }
                    commands.insert(started.id, started.commands);
                }
                StartOutcome::Refused(info) => host.registry.upsert(info),
            }
        }

        Ok(host)
    }

    pub fn discover(
        plugin_dir: &Path,
        path: Option<&OsStr>,
        policy: HostPolicy,
    ) -> Result<Self, HostError> {
        Self::start(discover_candidates(plugin_dir, path), policy)
    }

    pub fn list(&self) -> Vec<PluginInfo> {
        self.registry.list()
    }

    pub fn live_summary(&self) -> (usize, Vec<String>) {
        self.registry.live_summary()
    }

    pub fn live_ids(&self) -> std::collections::BTreeSet<String> {
        self.registry
            .list()
            .into_iter()
            .filter(|plugin| plugin.status == PluginStatus::Live)
            .map(|plugin| plugin.id)
            .collect()
    }

    pub fn wait_for_status(&self, id: &str, status: PluginStatus, timeout: Duration) -> bool {
        self.registry.wait_for_status(id, status, timeout)
    }

    pub fn call(
        &self,
        plugin_id: &str,
        capability: &str,
        operation: &str,
        input: Value,
    ) -> Result<Value, PluginCallError> {
        self.call_with_context(plugin_id, capability, operation, input, None, None)
    }

    pub fn call_for_account(
        &self,
        plugin_id: &str,
        capability: &str,
        operation: &str,
        input: Value,
        account_id: &str,
        config: Option<Value>,
    ) -> Result<Value, PluginCallError> {
        self.call_with_context(
            plugin_id,
            capability,
            operation,
            input,
            Some(account_id.to_string()),
            config,
        )
    }

    fn call_with_context(
        &self,
        plugin_id: &str,
        capability: &str,
        operation: &str,
        input: Value,
        account_id: Option<String>,
        config: Option<Value>,
    ) -> Result<Value, PluginCallError> {
        let capability = PluginCapability::parse(capability).ok_or_else(|| {
            PluginCallError::CapabilityUnavailable {
                plugin_id: plugin_id.into(),
                capability: capability.into(),
            }
        })?;
        let info = self
            .registry
            .get(plugin_id)
            .ok_or_else(|| PluginCallError::Unavailable {
                plugin_id: plugin_id.into(),
                reason: "plugin is not installed".into(),
            })?;
        if info.status != PluginStatus::Live {
            return Err(PluginCallError::Unavailable {
                plugin_id: plugin_id.into(),
                reason: info
                    .reason
                    .unwrap_or_else(|| format!("plugin status is {}", info.status.as_str())),
            });
        }
        if !info
            .capabilities
            .iter()
            .any(|declared| declared == capability.as_str())
        {
            return Err(PluginCallError::CapabilityUnavailable {
                plugin_id: plugin_id.into(),
                capability: capability.as_str().into(),
            });
        }

        let sender = self
            .commands
            .lock()
            .expect("plugin host poisoned")
            .get(plugin_id)
            .cloned()
            .ok_or_else(|| PluginCallError::Unavailable {
                plugin_id: plugin_id.into(),
                reason: "plugin supervisor is not running".into(),
            })?;
        let (reply, outcome) = mpsc::channel();
        sender
            .send(SupervisorCommand::Call {
                invocation: Box::new(PluginInvocation {
                    capability,
                    operation: operation.into(),
                    input,
                    account_id,
                    config,
                }),
                reply,
            })
            .map_err(|_| PluginCallError::Unavailable {
                plugin_id: plugin_id.into(),
                reason: "plugin supervisor stopped".into(),
            })?;
        outcome
            .recv_timeout(self.policy.call_timeout + Duration::from_secs(1))
            .map_err(|_| PluginCallError::Unavailable {
                plugin_id: plugin_id.into(),
                reason: "plugin supervisor did not return a call outcome".into(),
            })?
    }
}

impl Drop for PluginHost {
    fn drop(&mut self) {
        // Only the last clone owns shutdown. AppState and request tasks clone the host.
        if Arc::strong_count(&self.commands) != 1 {
            return;
        }
        for sender in self.commands.lock().expect("plugin host poisoned").values() {
            let _ = sender.send(SupervisorCommand::Shutdown);
        }
    }
}

pub fn discover_candidates(plugin_dir: &Path, path: Option<&OsStr>) -> Vec<PluginCandidate> {
    let mut found = Vec::new();
    let mut seen = HashSet::new();
    let directories = std::iter::once(plugin_dir.to_path_buf()).chain(
        path.into_iter()
            .flat_map(std::env::split_paths)
            .collect::<Vec<_>>(),
    );

    for directory in directories {
        let Ok(entries) = std::fs::read_dir(directory) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let is_plugin = path
                .file_name()
                .and_then(OsStr::to_str)
                .is_some_and(|name| name.starts_with(PLUGIN_PREFIX));
            if !is_plugin || !is_executable(&path) {
                continue;
            }
            let identity = std::fs::canonicalize(&path).unwrap_or_else(|_| path.clone());
            if seen.insert(identity) {
                found.push(PluginCandidate::new(path));
            }
        }
    }

    found.sort_by(|left, right| left.path.cmp(&right.path));
    found
}

#[cfg(unix)]
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    path.metadata()
        .is_ok_and(|metadata| metadata.is_file() && metadata.permissions().mode() & 0o111 != 0)
}

#[cfg(not(unix))]
fn is_executable(path: &Path) -> bool {
    path.is_file()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::Permissions;

    #[cfg(unix)]
    #[test]
    fn discovery_deduplicates_the_same_executable_across_plugin_dir_and_path() {
        use std::os::unix::fs::{symlink, PermissionsExt};

        let root = tempfile::tempdir().expect("temp dir");
        let plugin_dir = root.path().join("plugins");
        let path_dir = root.path().join("bin");
        std::fs::create_dir_all(&plugin_dir).expect("plugin dir");
        std::fs::create_dir_all(&path_dir).expect("path dir");
        let plugin = plugin_dir.join("pyxis-plugin-one");
        std::fs::write(&plugin, "#!/bin/sh\n").expect("write");
        std::fs::set_permissions(&plugin, Permissions::from_mode(0o755)).expect("chmod");
        symlink(&plugin, path_dir.join("pyxis-plugin-one")).expect("symlink");

        let found = discover_candidates(&plugin_dir, Some(path_dir.as_os_str()));

        assert_eq!(found.len(), 1);
    }
}
