# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development - run both web frontend and backend server
bun run dev:web     # Vite dev server on port 5678
bun run dev:server  # Bun server on port 8765

# Build
bun run build       # TypeScript compilation (CLI)
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

### Three-Layer System

```
CLI (src/cli/)                    Web Frontend (src/web/)
       ↓                                    ↓
Pandora Client Library (src/)     tRPC Server (server/)
       ↓                                    ↓
Pandora JSON API                  Source Manager (multi-source abstraction)
```

**CLI**: Commander.js-based tool for direct Pandora API access. Entry point at `src/cli/bin.ts`.

**Web Frontend**: React + TanStack Router + tRPC client. Connects to backend via proxied `/trpc` endpoint.

**Backend Server**: Bun HTTP server with tRPC API (`server/router.ts`), WebSocket support, and audio streaming proxy (`/stream/:compositeTrackId`).

### Source Abstraction Layer (src/sources/)

Unified interface for multiple music backends:
- `pandora/` - Pandora radio integration
- `ytmusic/` - YouTube Music via yt-dlp
- `types.ts` - Canonical types: `CanonicalTrack`, `CanonicalAlbum`, `CanonicalPlaylist`
- `index.ts` - `SourceManager` aggregates all sources

Sources implement capability interfaces: `SearchCapability`, `PlaylistCapability`, `StreamCapability`, `AlbumCapability`.

### Pandora API Implementation

Authentication flow in `src/api/auth.ts`:
1. Partner login (unencrypted) → receive syncTime + partnerAuthToken
2. User login (Blowfish ECB encrypted) → receive userAuthToken
3. All subsequent calls encrypted with `syncTime` offset

Crypto layer (`src/crypto/`): Blowfish ECB encryption for API payloads using Dojo Toolkit cipher.

### Effect-TS Patterns

All async operations use Effect for type-safe error handling:
- Tagged errors in `src/types/errors.ts` (ApiCallError, SessionError, etc.)
- Error handling via `src/cli/errors/handler.ts`

### Database (src/db/)

PGlite (in-browser Postgres) with Drizzle ORM. Schema defines: albums, album_source_refs, album_tracks, playlists, credentials.

### TypeScript Configuration

Two configs:
- `tsconfig.json` - CLI (NodeNext modules, output to `dist/`)
- `tsconfig.web.json` - Web frontend (ESNext/bundler, `@/*` path alias)

Both use strict mode with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`.

## Key Conventions

- Config file: `~/.config/pyxis/config.yaml` (YAML + environment variable override)
- Session cache: `~/.cache/pyxis/session.json`
- Logs directory: `~/.local/state/pyxis/` (XDG_STATE_HOME)
  - `server.log` - backend server logs
  - `web.log` - Vite dev server logs
- Composite track IDs format: `source:trackId` (e.g., `ytmusic:dQw4w9WgXcQ`)
