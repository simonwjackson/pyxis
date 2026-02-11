# Pyxis development commands

# Regenerate bun.nix from bun.lock
nix-lock:
    bun2nix --lock-file bun.lock --output-file bun.nix

# Build the nix package
build:
    nix build

# Run tests
test:
    bun test

# Typecheck
typecheck:
    bun run typecheck

# Dev mode (web frontend + server)
dev-web:
    bun run dev:web

dev-server:
    bun run dev:server
