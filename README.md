# Pyxis

Music streaming daemon with a web frontend, supporting Pandora and YouTube Music backends.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![Nix Flake](https://img.shields.io/badge/Nix-Flake-5277C3)](https://nixos.wiki/wiki/Flakes)

## Architecture

Two-process system:
- **Backend server** (`bun run dev:server`) — tRPC API + audio stream proxy on port 8765
- **Web frontend** (`bun run dev:web`) — React + Vite on port 5678

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

# Run both frontend and backend
bun run dev:web     # Vite dev server
bun run dev:server  # Bun backend server

# Build
bun run build:web   # Vite production build
nix build           # Full Nix package

# Testing & Quality
bun test            # Run all tests
bun run typecheck   # TypeScript type checking

# After dependency changes
just update-hashes  # Update Nix npm dependency hash
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
