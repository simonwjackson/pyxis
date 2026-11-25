# Pyxis development tasks.
# Everything assumes the direnv-loaded flake shell, not globally installed binaries.

default:
    @just --list

# The single gate. Every implementation unit must leave this passing.
verify: fmt-check lint lint-shell test-rust contract-check typecheck lint-ts test-ts

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
    shellcheck tools/dev tools/link-proseql tools/test-pandora-fixtures tools/verify-api-example tools/verify-api-example-local

test-rust:
    cargo test --all

# The @proseql browser packages come from Nix rather than the lockfile, and `bun install`
# removes them. Every recipe that resolves TypeScript imports relinks them first.
link-proseql:
    tools/link-proseql

typecheck: link-proseql
    bun run typecheck

lint-ts:
    biome check .

test-ts: link-proseql
    bun run test

# Select related app tests; paths are relative to clients/app. Not a full gate.
test-app-related +FILES: link-proseql
    bun run --cwd clients/app vitest related --run --passWithNoTests=false {{FILES}}

test-pandora-fixtures:
    tools/test-pandora-fixtures

# Start the core with the YouTube Music plugin.
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

# Repoint the proseql input at GitHub main. Push proseql first; builders fetch from GitHub.
proseql-pin:
    #!/usr/bin/env bash
    set -euo pipefail
    rev=$(git ls-remote https://github.com/simonwjackson/proseql.git refs/heads/main | cut -f1)
    sed -i -E "s|(github:simonwjackson/proseql/)[0-9a-f]{40}|\1$rev|" flake.nix
    nix flake update proseql
    # The dev shell links the new proseql crates; resolve them into Cargo.lock now, because
    # the Nix build runs cargo --offline against the committed lock.
    nix develop --command cargo metadata --format-version 1 > /dev/null
    nix develop --command cargo metadata --format-version 1 --locked > /dev/null
    echo "proseql pinned to $rev; commit flake.nix, flake.lock and Cargo.lock together"
