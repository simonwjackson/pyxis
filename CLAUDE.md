# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development - run both web frontend and backend server
bun run dev:web     # Vite dev server on port 5678
bun run dev:server  # Bun server on port 8765

# Build
bun run build:web   # Vite production build
nix build           # Full Nix package

# Testing & Quality
bun test            # Run all tests
bun test <file>     # Run single test file
bun run typecheck   # TypeScript type checking

# After dependency changes
just update-hashes  # Update Nix npm dependency hash
```

## Architecture

### Two-Layer System

```
Web Frontend (src/web/)              tRPC Server (server/)
       ↓                                    ↓
tRPC Client ──────────────────→ Source Manager (src/sources/)
                                       ↓              ↓
                                 Pandora Source   YTMusic Source
```

**Web Frontend**: React + TanStack Router + tRPC client. Connects to backend via proxied `/trpc` endpoint.

**Backend Server**: Bun HTTP server with tRPC API (`server/router.ts`), WebSocket support, and audio streaming proxy (`/stream/:compositeTrackId`).

### Source Abstraction Layer (src/sources/)

Unified interface for multiple music backends:
- `pandora/` - Self-contained Pandora client library (API, crypto, HTTP, types)
- `ytmusic/` - YouTube Music via yt-dlp
- `types.ts` - Canonical types: `CanonicalTrack`, `CanonicalAlbum`, `CanonicalPlaylist`
- `index.ts` - `SourceManager` aggregates all sources

Sources implement capability interfaces: `SearchCapability`, `PlaylistCapability`, `StreamCapability`, `AlbumCapability`.

### Pandora Source (src/sources/pandora/)

Authentication flow in `src/sources/pandora/api/auth.ts`:
1. Partner login (unencrypted) → receive syncTime + partnerAuthToken
2. User login (Blowfish ECB encrypted) → receive userAuthToken
3. All subsequent calls encrypted with `syncTime` offset

Crypto layer (`src/sources/pandora/crypto/`): Blowfish ECB encryption for API payloads using Dojo Toolkit cipher.

### Effect-TS Patterns

All Pandora API operations use Effect for type-safe error handling:
- Tagged errors in `src/sources/pandora/types/errors.ts` (ApiCallError, SessionError, etc.)

### Database (src/db/)

PGlite (in-browser Postgres) with Drizzle ORM. Schema defines: albums, album_source_refs, album_tracks, playlists, credentials.

### TypeScript Configuration

Two configs:
- `tsconfig.json` - Server + sources (NodeNext modules)
- `tsconfig.web.json` - Web frontend (ESNext/bundler, `@/*` path alias)

Both use strict mode with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`.

## Debugging

**MANDATORY**: When investigating ANY bug, your FIRST action must be reading the relevant logs. Do NOT read source code, form hypotheses, or propose fixes until you have checked the logs. The logs are the source of truth — they show what actually happened, not what you think happened.

```bash
# ALWAYS run these FIRST when debugging (before reading any source code)
tail -200 /home/simonwjackson/.local/state/pyxis/playback.log   # Player, queue, SSE, client-reported logs
tail -200 /home/simonwjackson/.local/state/pyxis/server.log      # tRPC requests, startup, errors
tail -200 /home/simonwjackson/.local/state/pyxis/stream.log      # Audio stream proxy, cache hits/misses
tail -200 /home/simonwjackson/.local/state/pyxis/radio.log       # Radio station operations
tail -200 /home/simonwjackson/.local/state/pyxis/web.log         # Vite dev server
```

The logs contain structured data from both server-side and client-side (via `log.client` mutation). Look for error patterns, missing expected events, and timing issues. Let the logs guide your investigation.

## Key Conventions

- Logs directory: `~/.local/state/pyxis/` (XDG_STATE_HOME)
  - `server.log` - backend server logs
  - `playback.log` - player, queue, SSE, client logs
  - `stream.log` - cache, prefetch, upstream requests
  - `radio.log` - radio station operations
  - `web.log` - Vite dev server logs
- Logging: pino-based structured JSON logging (`src/logger.ts`)
  - `createLogger(name)` returns a pino logger with file + console dual output
  - Use `.child({ component: "name" })` for sub-contexts
  - Structured calls: `log.info({ key: val }, "message")` not string interpolation
  - `LOG_LEVEL` env var controls level (trace/debug/info/warn/error/fatal), default "info"
  - Console: pino-pretty when TTY, raw JSON when piped
  - `Logger` type is re-exported `pino.Logger`
- Composite track IDs format: `source:trackId` (e.g., `ytmusic:dQw4w9WgXcQ`)
