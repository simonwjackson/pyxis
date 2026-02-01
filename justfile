# Pyxis development commands

# Update nix hashes after dependency changes
update-hashes:
    ./nix/scripts/update-hashes.sh

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
