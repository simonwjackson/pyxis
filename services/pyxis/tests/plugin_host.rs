use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use pyxis::plugins::host::{HostPolicy, PluginCallError, PluginCandidate, PluginHost};
use pyxis::plugins::registry::PluginStatus;
use serde_json::json;

fn laboratory(id: &str, behavior: &str) -> PluginCandidate {
    PluginCandidate::new(PathBuf::from(env!("CARGO_BIN_EXE_pyxis-plugin-laboratory")))
        .with_env("PYXIS_LAB_ID", id)
        .with_env("PYXIS_LAB_BEHAVIOR", behavior)
}

fn policy() -> HostPolicy {
    HostPolicy {
        handshake_timeout: Duration::from_secs(2),
        call_timeout: Duration::from_millis(100),
        restart_backoff: Duration::from_millis(10),
        quarantine_after: 3,
        quarantine_window: Duration::from_secs(2),
    }
}

#[test]
fn two_plugins_can_contribute_the_same_capability_and_receive_calls_independently() {
    let host = PluginHost::start(
        vec![laboratory("alpha", "ready"), laboratory("beta", "ready")],
        policy(),
    )
    .expect("start host");

    let plugins = host.list();
    assert_eq!(plugins.len(), 2);
    assert!(plugins.iter().all(|plugin| {
        plugin.status == PluginStatus::Live && plugin.capabilities == ["source"]
    }));

    let alpha = host
        .call("alpha", "source", "search", json!({ "query": "Bowie" }))
        .expect("alpha call");
    let beta = host
        .call("beta", "source", "search", json!({ "query": "Bowie" }))
        .expect("beta call");

    assert_eq!(alpha["pluginId"], "alpha");
    assert_eq!(beta["pluginId"], "beta");
}

#[test]
fn mismatched_protocol_is_refused_instead_of_half_working() {
    let host = PluginHost::start(vec![laboratory("future", "mismatch")], policy())
        .expect("host survives refused plugin");

    let plugin = &host.list()[0];
    assert_eq!(plugin.id, "future");
    assert_eq!(plugin.status, PluginStatus::Refused);
    assert!(plugin
        .reason
        .as_deref()
        .expect("reason")
        .contains("protocol version"));
    assert!(matches!(
        host.call("future", "source", "search", json!({})),
        Err(PluginCallError::Unavailable { .. })
    ));
}

#[test]
fn a_process_that_exits_mid_call_fails_once_then_restarts() {
    let marker_dir = tempfile::tempdir().expect("marker dir");
    let marker = marker_dir.path().join("crashed-once");
    let candidate =
        laboratory("restart", "crash-once").with_env("PYXIS_LAB_MARKER", marker.as_os_str());
    let host = PluginHost::start(vec![candidate], policy()).expect("start host");

    assert!(matches!(
        host.call("restart", "source", "search", json!({})),
        Err(PluginCallError::ProcessExited { .. })
    ));
    assert!(host.wait_for_status("restart", PluginStatus::Live, Duration::from_secs(2)));

    let response = host
        .call("restart", "source", "search", json!({ "second": true }))
        .expect("call after restart");
    assert_eq!(response["pluginId"], "restart");
}

#[test]
fn a_hung_call_times_out_and_does_not_hang_the_core() {
    let host = PluginHost::start(vec![laboratory("slow", "hang")], policy()).expect("start host");

    assert!(matches!(
        host.call("slow", "source", "search", json!({})),
        Err(PluginCallError::Timeout { .. })
    ));
    assert!(host.wait_for_status("slow", PluginStatus::Live, Duration::from_secs(2)));
}

#[test]
fn a_long_provider_call_can_be_cancelled_during_shutdown() {
    let host = PluginHost::start(vec![laboratory("cancel", "hang")], policy()).expect("host");
    let cancellation = Arc::new(AtomicBool::new(false));
    let signal = cancellation.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(100));
        signal.store(true, Ordering::Relaxed);
    });
    let started = std::time::Instant::now();

    let result = host.call_for_account_with_timeout(
        "cancel",
        "source",
        "search",
        json!({}),
        "default",
        None,
        Duration::from_secs(60),
        cancellation,
    );

    assert!(matches!(result, Err(PluginCallError::Unavailable { .. })));
    assert!(started.elapsed() < Duration::from_secs(2));
}

#[test]
fn an_oversized_protocol_line_is_rejected_without_exhausting_core_memory() {
    let host =
        PluginHost::start(vec![laboratory("noisy", "oversized")], policy()).expect("start host");

    let error = host
        .call("noisy", "source", "search", json!({}))
        .expect_err("oversized response");

    assert!(matches!(error, PluginCallError::Protocol { .. }));
    assert!(error.to_string().contains("1048576 byte protocol limit"));
}

#[test]
fn repeated_crashes_quarantine_instead_of_restart_looping_forever() {
    let host = PluginHost::start(
        vec![laboratory("broken", "crash-after-handshake")],
        policy(),
    )
    .expect("start host");

    assert!(host.wait_for_status("broken", PluginStatus::Quarantined, Duration::from_secs(2)));
    let plugin = host
        .list()
        .into_iter()
        .find(|plugin| plugin.id == "broken")
        .expect("plugin");
    assert!(plugin.reason.as_deref().expect("reason").contains("crash"));
}
