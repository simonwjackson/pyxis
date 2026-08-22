# Pyxis development tasks.
# Everything assumes the direnv-loaded flake shell, not globally installed binaries.

default:
    @just --list

# The single gate. Every implementation unit must leave this passing.
verify: fmt-check lint lint-shell test-rust contract-check typecheck lint-ts test-ts build-client

# Regenerate the TypeScript types and JSON Schema from the Rust contract.
contracts:
    services/pyxis/generate-contracts.sh

# Fail when committed contract artifacts have drifted from the Rust source.
contract-check:
    services/pyxis/generate-contracts.sh --check

# Format owned Rust and TypeScript sources in place. Generated contracts are excluded.
format:
    cargo fmt --all
    biome check --write .

fmt-check:
    cargo fmt --all -- --check

lint:
    cargo clippy --all-targets --all-features -- -D warnings

lint-shell:
    shellcheck tools/dev tools/test-pandora-fixtures tools/verify-api-example

test-rust:
    cargo test --all

typecheck:
    bun run typecheck

lint-ts:
    biome check .

test-ts:
    bun run test

test-pandora-fixtures:
    tools/test-pandora-fixtures

build-client:
    bun run --cwd clients/app build

# Start core, the YouTube Music plugin, and the unstyled reference client.
dev:
    tools/dev

# Run only the core service from source.
dev-core *ARGS:
    cargo run --bin pyxis -- {{ARGS}}

build:
    cargo build --release

# Regenerate the deterministic Bun dependency closure after bun.lock changes.
nix-lock:
    bun2nix --lock-file bun.lock --output-file bun.nix

# Repoint the proseql input at the local checkout's current HEAD.
# The rev is pinned in flake.nix because Nix cannot lock a dirty local input.
proseql-pin:
    #!/usr/bin/env bash
    set -euo pipefail
    rev=$(git -C ~/code/github/simonwjackson/proseql rev-parse HEAD)
    sed -i -E "s|(proseql\?rev=)[0-9a-f]{40}|\1$rev|" flake.nix
    nix flake lock --update-input proseql
    echo "proseql pinned to $rev"
