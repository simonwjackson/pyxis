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

# Dev mode (watch typescript)
dev:
    bun run dev
