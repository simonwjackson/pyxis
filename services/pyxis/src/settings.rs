//! Runtime settings and their resolution order.
//!
//! Resolution is defaults, then environment, then explicit arguments. There is no config
//! file in v1: every value here is either a safe default or an operational override, and
//! secrets belong to per-account plugin credentials in the store rather than to a file on
//! disk.

use std::net::{IpAddr, Ipv4Addr};
use std::path::PathBuf;

/// Loopback by default. The tailnet edge is a separate process, so the core never needs to
/// bind a routable address itself. Binding wider is an explicit operator choice.
pub const DEFAULT_HOST: IpAddr = IpAddr::V4(Ipv4Addr::LOCALHOST);
pub const DEFAULT_PORT: u16 = 4488;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Settings {
    pub host: IpAddr,
    pub port: u16,
    pub state_dir: PathBuf,
}

impl Settings {
    /// Resolve settings from optional overrides, falling back to the environment and then
    /// to defaults.
    pub fn resolve(
        host: Option<IpAddr>,
        port: Option<u16>,
        state_dir: Option<PathBuf>,
        env: &impl EnvSource,
    ) -> Self {
        Settings {
            host: host.unwrap_or(DEFAULT_HOST),
            port: port.unwrap_or(DEFAULT_PORT),
            state_dir: state_dir.unwrap_or_else(|| default_state_dir(env)),
        }
    }
}

/// Environment lookup, injectable so resolution stays testable without touching the real
/// process environment.
pub trait EnvSource {
    fn get(&self, key: &str) -> Option<String>;
}

pub struct ProcessEnv;

impl EnvSource for ProcessEnv {
    fn get(&self, key: &str) -> Option<String> {
        std::env::var(key).ok()
    }
}

/// `$XDG_DATA_HOME/pyxis`, falling back to `$HOME/.local/share/pyxis`.
///
/// v1 ran as a system service under `/var/lib/pyxis`. v2 installs per user via
/// `nix profile`, so state moves into the user's data directory.
pub fn default_state_dir(env: &impl EnvSource) -> PathBuf {
    if let Some(xdg) = env.get("XDG_DATA_HOME").filter(|value| !value.is_empty()) {
        return PathBuf::from(xdg).join("pyxis");
    }

    let home = env.get("HOME").unwrap_or_else(|| ".".to_string());
    PathBuf::from(home).join(".local/share/pyxis")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    struct MapEnv(HashMap<String, String>);

    impl MapEnv {
        fn new(pairs: &[(&str, &str)]) -> Self {
            MapEnv(
                pairs
                    .iter()
                    .map(|(k, v)| ((*k).to_string(), (*v).to_string()))
                    .collect(),
            )
        }
    }

    impl EnvSource for MapEnv {
        fn get(&self, key: &str) -> Option<String> {
            self.0.get(key).cloned()
        }
    }

    #[test]
    fn defaults_to_loopback_so_the_core_is_never_exposed_accidentally() {
        let settings = Settings::resolve(None, None, None, &MapEnv::new(&[("HOME", "/home/x")]));

        assert_eq!(settings.host, DEFAULT_HOST);
        assert_eq!(settings.port, DEFAULT_PORT);
    }

    #[test]
    fn explicit_arguments_win_over_defaults() {
        let settings = Settings::resolve(
            Some(IpAddr::V4(Ipv4Addr::new(0, 0, 0, 0))),
            Some(9000),
            Some(PathBuf::from("/tmp/pyxis")),
            &MapEnv::new(&[("HOME", "/home/x")]),
        );

        assert_eq!(settings.host, IpAddr::V4(Ipv4Addr::new(0, 0, 0, 0)));
        assert_eq!(settings.port, 9000);
        assert_eq!(settings.state_dir, PathBuf::from("/tmp/pyxis"));
    }

    #[test]
    fn state_dir_prefers_xdg_data_home() {
        let env = MapEnv::new(&[("XDG_DATA_HOME", "/data"), ("HOME", "/home/x")]);

        assert_eq!(default_state_dir(&env), PathBuf::from("/data/pyxis"));
    }

    #[test]
    fn state_dir_falls_back_to_home_when_xdg_is_unset() {
        let env = MapEnv::new(&[("HOME", "/home/x")]);

        assert_eq!(
            default_state_dir(&env),
            PathBuf::from("/home/x/.local/share/pyxis")
        );
    }

    #[test]
    fn empty_xdg_data_home_is_treated_as_unset() {
        let env = MapEnv::new(&[("XDG_DATA_HOME", ""), ("HOME", "/home/x")]);

        assert_eq!(
            default_state_dir(&env),
            PathBuf::from("/home/x/.local/share/pyxis")
        );
    }
}
