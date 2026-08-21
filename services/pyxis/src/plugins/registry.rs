//! Thread-safe view of installed plugin health and capabilities.
//!
//! The supervisor is the only writer. RPC status and `plugin.list` read snapshots, so a
//! hung plugin cannot block the public API merely because its process owns some internal
//! lock.

use std::collections::{BTreeSet, HashMap};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

use super::protocol::{PluginManifest, PluginValue};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PluginStatus {
    Starting,
    Live,
    Restarting,
    Refused,
    Quarantined,
    Stopped,
}

impl PluginStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            PluginStatus::Starting => "starting",
            PluginStatus::Live => "live",
            PluginStatus::Restarting => "restarting",
            PluginStatus::Refused => "refused",
            PluginStatus::Quarantined => "quarantined",
            PluginStatus::Stopped => "stopped",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PluginInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub capabilities: Vec<String>,
    pub requires_config: bool,
    pub status: PluginStatus,
    pub reason: Option<String>,
}

impl PluginInfo {
    pub fn from_manifest(manifest: &PluginManifest, status: PluginStatus) -> Self {
        PluginInfo {
            id: manifest.id.clone(),
            name: manifest.name.clone(),
            version: manifest.version.clone(),
            capabilities: manifest
                .capabilities
                .iter()
                .map(|capability| capability.as_str().to_string())
                .collect(),
            requires_config: requires_config(&manifest.config_schema),
            status,
            reason: None,
        }
    }
}

fn requires_config(schema: &PluginValue) -> bool {
    let PluginValue::Object(fields) = schema else {
        return false;
    };
    matches!(fields.get("required"), Some(PluginValue::Array(required)) if !required.is_empty())
}

#[derive(Default)]
struct RegistryState {
    plugins: HashMap<String, PluginInfo>,
}

#[derive(Clone, Default)]
pub struct PluginRegistry {
    shared: Arc<(Mutex<RegistryState>, Condvar)>,
}

impl PluginRegistry {
    pub fn upsert(&self, info: PluginInfo) {
        let (state, changed) = &*self.shared;
        state
            .lock()
            .expect("plugin registry poisoned")
            .plugins
            .insert(info.id.clone(), info);
        changed.notify_all();
    }

    pub fn set_status(&self, id: &str, status: PluginStatus, reason: Option<String>) {
        let (state, changed) = &*self.shared;
        if let Some(plugin) = state
            .lock()
            .expect("plugin registry poisoned")
            .plugins
            .get_mut(id)
        {
            plugin.status = status;
            plugin.reason = reason;
        }
        changed.notify_all();
    }

    pub fn get(&self, id: &str) -> Option<PluginInfo> {
        self.shared
            .0
            .lock()
            .expect("plugin registry poisoned")
            .plugins
            .get(id)
            .cloned()
    }

    pub fn list(&self) -> Vec<PluginInfo> {
        let mut plugins: Vec<_> = self
            .shared
            .0
            .lock()
            .expect("plugin registry poisoned")
            .plugins
            .values()
            .cloned()
            .collect();
        plugins.sort_by(|left, right| left.id.cmp(&right.id));
        plugins
    }

    pub fn live_summary(&self) -> (usize, Vec<String>) {
        let plugins = self.list();
        let live: Vec<_> = plugins
            .into_iter()
            .filter(|plugin| plugin.status == PluginStatus::Live)
            .collect();
        let capabilities: BTreeSet<_> = live
            .iter()
            .flat_map(|plugin| plugin.capabilities.iter().cloned())
            .collect();
        (live.len(), capabilities.into_iter().collect())
    }

    pub fn wait_for_status(&self, id: &str, expected: PluginStatus, timeout: Duration) -> bool {
        let deadline = Instant::now() + timeout;
        let (state, changed) = &*self.shared;
        let mut state = state.lock().expect("plugin registry poisoned");

        loop {
            if state
                .plugins
                .get(id)
                .is_some_and(|plugin| plugin.status == expected)
            {
                return true;
            }
            let now = Instant::now();
            if now >= deadline {
                return false;
            }
            let (next, timed) = changed
                .wait_timeout(state, deadline - now)
                .expect("plugin registry poisoned");
            state = next;
            if timed.timed_out() {
                return state
                    .plugins
                    .get(id)
                    .is_some_and(|plugin| plugin.status == expected);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::plugins::protocol::{PluginCapability, PluginValue, PLUGIN_PROTOCOL_VERSION};

    #[test]
    fn summary_counts_only_live_plugins_and_deduplicates_capabilities() {
        let registry = PluginRegistry::default();
        for (id, status) in [
            ("a", PluginStatus::Live),
            ("b", PluginStatus::Live),
            ("c", PluginStatus::Refused),
        ] {
            registry.upsert(PluginInfo::from_manifest(
                &PluginManifest {
                    id: id.into(),
                    name: id.into(),
                    version: "1".into(),
                    protocol_version: PLUGIN_PROTOCOL_VERSION,
                    capabilities: vec![PluginCapability::Source],
                    config_schema: PluginValue::Object(Default::default()),
                },
                status,
            ));
        }

        assert_eq!(registry.live_summary(), (2, vec!["source".to_string()]));
    }
}
