# Pyxis development tasks.
# Everything assumes the direnv-loaded flake shell, not globally installed binaries.

default:
    @just --list

# The single gate. Every implementation unit must leave this passing.
verify: fmt-check lint test-rust contract-check

# Regenerate the TypeScript types and JSON Schema from the Rust contract.
contracts:
    services/pyxis/generate-contracts.sh

# Fail when committed contract artifacts have drifted from the Rust source.
contract-check:
    services/pyxis/generate-contracts.sh --check

# Format Rust sources in place.
format:
    cargo fmt --all

fmt-check:
    cargo fmt --all -- --check

lint:
    cargo clippy --all-targets --all-features -- -D warnings

test-rust:
    cargo test --all

# Run the service from source.
dev *ARGS:
    cargo run --bin pyxis -- {{ARGS}}

build:
    cargo build --release

# Repoint the proseql input at the local checkout's current HEAD.
# The rev is pinned in flake.nix because Nix cannot lock a dirty local input.
proseql-pin:
    #!/usr/bin/env bash
    set -euo pipefail
    rev=$(git -C ~/code/github/simonwjackson/proseql rev-parse HEAD)
    sed -i -E "s|(proseql\?rev=)[0-9a-f]{40}|\1$rev|" flake.nix
    nix flake lock --update-input proseql
    echo "proseql pinned to $rev"
