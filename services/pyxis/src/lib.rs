//! Pyxis core service.
//!
//! The core owns accounts, library, device-hosted sessions, matching, media candidates
//! and sync. Every music provider lives outside this crate, behind the plugin protocol.
//! The core is required to start and serve with zero plugins installed.

pub mod accounts;
pub mod api;
pub mod db;
pub mod instance_lock;
pub mod media;
pub mod plugins;
pub mod rpc;
pub mod settings;

/// Version reported by `system.status.get` and the `--version` flag.
pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_is_the_crate_version() {
        assert_eq!(version(), env!("CARGO_PKG_VERSION"));
    }
}
