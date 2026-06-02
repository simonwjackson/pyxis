# Pyxis

Music streaming daemon with a web frontend, supporting Pandora and YouTube Music backends.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![Nix Flake](https://img.shields.io/badge/Nix-Flake-5277C3)](https://nixos.wiki/wiki/Flakes)

## Architecture

Single Bun server with embedded web development mode:
- **Backend server** (`bun run dev`) — Effect RPC API at `/rpc`, plain HTTP audio stream proxy at `/stream/:compositeTrackId`, and Vite middleware in development on port 8765
- **Production web frontend** (`bun run build:web`) — React/Vite build served by the Bun server from `dist-web/`
- **Application runtime** — Effect Schema wire contracts in `src/api/contracts/**`, the authoritative RPC group in `src/api/rpc.ts`, Effect service/layer wiring in `server/rpc/**`, and web state through Effect atoms + `PyxisRpcClient`

## Configuration

Configuration uses a layered YAML system with environment variable overrides.

### Config File

Default location: `~/.config/pyxis/config.yaml` (XDG_CONFIG_HOME)

```yaml
server:
  port: 8765
  hostname: localhost

web:
  port: 5678
  allowedHosts:
    - pyxis.hummingbird-lake.ts.net

sources:
  pandora:
    username: user@example.com
    # password via PYXIS_PANDORA_PASSWORD env var only

library:
  albumRelationship:
    hot:
      # Albums become Hot after this many listens inside the window.
      minRecentListens: 3
      # Recent-listen window used by library.hotAlbums and album state resolution.
      windowDays: 30

log:
  level: info    # trace | debug | info | warn | error | fatal
```

The server accepts a `--config <path>` flag to use a custom config file path.

### Environment Variables

Environment variables override YAML config values:

| Env Var | Overrides | Purpose |
|---------|-----------|---------|
| `PYXIS_PANDORA_PASSWORD` | (secrets only) | Pandora password |
| `PYXIS_SERVER_PORT` | `server.port` | Server port |
| `PYXIS_SERVER_HOSTNAME` | `server.hostname` | Server hostname |
| `PYXIS_WEB_PORT` | `web.port` | Vite dev port |
| `PYXIS_LOG_LEVEL` | `log.level` | Log level |

Passwords are **never** stored in the config file or database — use `PYXIS_PANDORA_PASSWORD` exclusively.

### Resolution Order

Schema defaults → YAML file → Environment variables

If no config file exists, the server starts with defaults.

## Development

```bash
# Enter dev environment
nix develop

# Run development server
just dev            # Bun server with Vite embedded

# Build
bun run build:web   # Vite production build
nix build           # Full Nix package

# Testing & Quality
just format         # Format changed files
just lint           # Check formatting and lint rules for changed files
just test-unit      # Run unit tests (default gate; Pandora replay tests are skipped)
just test-pandora-fixtures  # Pandora fixture-replay integration tests; needs recorded fixtures
just typecheck      # TypeScript type checking

# Android Sony kiosk MVP
just android-build   # Build debug APK
just android-test    # Run Android JVM unit tests
just android-install # Install debug APK on a connected device

# After dependency changes
just nix-lock        # Regenerate bun.nix from bun.lock
```

### Android Sony kiosk MVP

The Android kiosk APK is a debug-only native WebView shell for the Sony Walkman NW-A306. It targets the local Pyxis server at `http://192.168.1.243:8765/` for the MVP.

The optional native MediaSession bridge is disabled unless a local token is supplied to both the daemon and Android build:

```bash
export PYXIS_ANDROID_BRIDGE_ENABLED=1
export PYXIS_ANDROID_BRIDGE_TOKEN='<local-dev-token>'
```

The token is sent in the `X-Pyxis-Bridge-Token` header for `/android-media-bridge/*`; it is never placed in URLs.

Read the provisioning/recovery runbook and validation checklist before attempting Device Owner setup:

```text
docs/operations/sony-android-kiosk-provisioning.md
docs/operations/sony-android-kiosk-validation.md
docs/operations/sony-android-mediasession-validation.md
```

### Nix Home Manager

```nix
programs.pyxis = {
  enable = true;
  package = inputs.pyxis.packages.${system}.default;
  server.port = 8765;
  server.hostname = "aka";
  web.port = 5678;
  web.allowedHosts = [ "pyxis.hummingbird-lake.ts.net" ];
  sources.pandora.username = "user@example.com";
  sources.pandora.passwordFile = "/run/secrets/pandora-password";
  log.level = "info";
};
```

## API

This package can also be used as a library:

```typescript
import * as Pandora from './src/index.js'
import { Effect } from 'effect'

const program = Effect.gen(function* () {
  const session = yield* Pandora.login('user@example.com', 'password')
  const { stations } = yield* Pandora.getStationList(session)

  for (const station of stations) {
    console.log(station.stationName)
  }
})

Effect.runPromise(program)
```

## How It Works

This client implements the [unofficial Pandora JSON API](https://6xq.net/pandora-apidoc/), handling:

- **Partner authentication** - Authenticates as an Android/iOS device
- **Blowfish encryption** - All API calls use ECB-mode Blowfish encryption
- **Time synchronization** - Maintains server time offset for request signing
- **Session management** - Handles auth tokens and session persistence

Built with [Effect](https://effect.website/) for functional error handling and type-safe async operations.

## License

MIT

## Disclaimer

This is an unofficial client and is not affiliated with Pandora Media, LLC. Use at your own risk. Ensure compliance with Pandora's Terms of Service.
