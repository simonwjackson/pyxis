use serde_json::Value;
use std::{path::Path, process::Command};

/// Validate actual HTTP / WS responses with the schema that already shipped.
pub fn check_v4_schema(definition: &str, message: &Value) {
    let output = Command::new("bun")
        .arg(Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/v4_schema/check.mjs"))
        .args([definition, &message.to_string()])
        .output()
        .expect("run a0718de schema check");
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
}
