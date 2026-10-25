//! Writes the JSON Schema for the wire contract.
//!
//! Invoked by `generate-contracts.sh`. The schema is the runtime trust boundary: clients
//! validate against it so a malformed or unknown response is rejected rather than
//! half-parsed.

use std::io::Write;
use std::path::PathBuf;

use pyxis::rpc::contract::{RpcContractSchema, CONTRACT_ID};

fn main() -> anyhow::Result<()> {
    let output = std::env::args_os()
        .nth(1)
        .map(PathBuf::from)
        .ok_or_else(|| anyhow::anyhow!("usage: generate-contract <output.json>"))?;

    let mut schema = serde_json::to_value(schemars::schema_for!(RpcContractSchema))?;
    schema["$comment"] = serde_json::json!(format!("Wire contract: {CONTRACT_ID}"));
    let bytes = serde_json::to_vec_pretty(&schema)?;

    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(output, [bytes, b"\n".to_vec()].concat())?;

    if let Some(typescript) = std::env::args_os().nth(2) {
        std::fs::OpenOptions::new()
            .append(true)
            .open(typescript)?
            .write_all(
                format!("\nexport const RPC_CONTRACT_ID = {CONTRACT_ID:?} as const;\n").as_bytes(),
            )?;
    }
    Ok(())
}
