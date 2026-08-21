//! Writes the JSON Schema for the wire contract.
//!
//! Invoked by `generate-contracts.sh`. The schema is the runtime trust boundary: clients
//! validate against it so a malformed or unknown response is rejected rather than
//! half-parsed.

use std::path::PathBuf;

use pyxis::rpc::contract::RpcContractSchema;

fn main() -> anyhow::Result<()> {
    let output = std::env::args_os()
        .nth(1)
        .map(PathBuf::from)
        .ok_or_else(|| anyhow::anyhow!("usage: generate-contract <output.json>"))?;

    let schema = schemars::schema_for!(RpcContractSchema);
    let bytes = serde_json::to_vec_pretty(&schema)?;

    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(output, [bytes, b"\n".to_vec()].concat())?;

    Ok(())
}
