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

# Run unit tests
test-unit:
    bun test

# Check formatting and lint rules for changed files
lint:
    sh -c 'files=$(git diff --name-only --diff-filter=ACMR HEAD -- "*.ts" "*.tsx" "*.js" "*.jsx" "*.json" "*.jsonc" "*.html" "*.css"); if [ -n "$files" ]; then bunx @biomejs/biome check $files; fi'

# Format changed files
format:
    sh -c 'files=$(git diff --name-only --diff-filter=ACMR HEAD -- "*.ts" "*.tsx" "*.js" "*.jsx" "*.json" "*.jsonc" "*.html" "*.css"); if [ -n "$files" ]; then bunx @biomejs/biome check --write $files; fi'

# Typecheck
typecheck:
    bun run typecheck

# Dev mode (Vite embedded in Bun server)
dev:
    bun run dev
