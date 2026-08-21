#!/usr/bin/env bash
# Regenerate the TypeScript types and JSON Schema from the Rust contract.
#
#   generate-contracts.sh            write artifacts into contracts/generated
#   generate-contracts.sh --check    verify committed artifacts match Rust
#
# --check is part of `just verify`, so a contract change that is not regenerated fails
# the gate rather than silently drifting away from every client.
set -euo pipefail

crate_dir="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$crate_dir/../.." && pwd)"
committed="$root/contracts/generated"
output="$committed"

check=false
if [[ "${1:-}" == "--check" ]]; then
  check=true
  temporary="$(mktemp -d)"
  trap 'rm -rf "$temporary"' EXIT
  output="$temporary"
fi

mkdir -p "$output"

typeshare "$crate_dir" --lang=typescript --output-file="$output/pyxis.ts"
# typeshare emits trailing whitespace and a variable number of trailing newlines, which
# makes --check spuriously fail across versions. Normalise both.
sed -i -e 's/[[:space:]]\+$//' "$output/pyxis.ts"
perl -0pi -e 's/\n+\z/\n/' "$output/pyxis.ts"

cargo run --quiet --manifest-path "$crate_dir/Cargo.toml" \
  --example generate-contract -- "$output/pyxis.schema.json"

if $check; then
  diff -u "$committed/pyxis.ts" "$output/pyxis.ts"
  diff -u "$committed/pyxis.schema.json" "$output/pyxis.schema.json"
  echo "contracts are in sync"
fi
