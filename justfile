# Pyxis development commands

# Regenerate bun.nix from bun.lock
nix-lock:
    bun2nix --lock-file bun.lock --output-file bun.nix

# Build the nix package
build:
    nix build

# Run tests
test:
    bun run test

# Run unit tests
test-unit:
    bun run test-unit

# Check formatting and lint rules for changed files
lint:
    bun run lint

# Format changed files
format:
    bun run format

# Typecheck
typecheck:
    bun run typecheck

# Dev mode (Vite embedded in Bun server)
dev:
    bun run dev

# Build the Sony Android debug APK
android-build:
    nix develop .#android --command bash -lc 'cd android && ./gradlew assembleDebug'

# Run Android JVM unit tests
android-test:
    nix develop .#android --command bash -lc 'cd android && ./gradlew testDebugUnitTest'

# Install the Sony Android debug APK on a connected device
android-install:
    nix develop .#android --command adb install -r -t android/app/build/outputs/apk/debug/app-debug.apk
