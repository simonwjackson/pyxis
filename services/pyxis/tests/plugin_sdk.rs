use std::path::PathBuf;

use pyxis::plugins::host::{HostPolicy, PluginCandidate, PluginHost};
use serde_json::json;

#[test]
fn a_typescript_plugin_authored_only_against_the_sdk_runs_under_the_real_host() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let plugin = root.join("packages/plugin-sdk/test/pyxis-plugin-sdk-reference");
    let host = PluginHost::start(vec![PluginCandidate::new(plugin)], HostPolicy::default())
        .expect("start SDK plugin");

    let response = host
        .call(
            "sdk-reference",
            "source",
            "search",
            json!({ "query": "Bowie" }),
        )
        .expect("call SDK plugin");

    assert_eq!(response["pluginId"], "sdk-reference");
    assert_eq!(response["input"]["query"], "Bowie");
}
