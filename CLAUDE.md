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

## Key Conventions

- Logs directory: `~/.local/state/pyxis/` (XDG_STATE_HOME)
  - `server.log` - backend server logs
  - `web.log` - Vite dev server logs
- Composite track IDs format: `source:trackId` (e.g., `ytmusic:dQw4w9WgXcQ`)
