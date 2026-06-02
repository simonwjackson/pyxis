# Architecture

## System Overview

```
Web Frontend (src/web/)
  React + TanStack Router + Effect atoms
  Connects to backend via Effect RPC /rpc endpoint
            ↓
Effect RPC Server (server/rpc/)
  handlers/         Effect RPC handlers by domain
  services/         Effect service/layer wrappers
  handler.ts        Full PyxisRpc handler layer
  http.ts           Bun-compatible /rpc HTTP adapter
  ../services/      Business logic (session, playback, stream, source manager)
            ↓
Source Manager (src/sources/)
  index.ts          SourceManager aggregates all sources
  types.ts          Canonical types, capability interfaces
  pandora/          Pandora source (full client library)
  ytmusic/          YouTube Music source (yt-dlp + internal API)
            ↓
Pandora JSON API v5         YouTube Music (yt-dlp)
```

## Application Runtime

Pyxis uses the Lattice runtime model end-to-end for application state and transport:

- **Effect Schema** in `src/api/contracts/**` is the source of truth for wire payloads, responses, and typed public errors.
- **Effect RPC** exposes the application API through the authoritative `PyxisRpc` group in `src/api/rpc.ts` and the `/rpc` HTTP endpoint.
- **Effect services/layers** in `server/rpc/**` adapt server capabilities behind explicit dependency seams before handlers call business services.
- **Effect atoms** and `PyxisRpcClient` drive web reads/writes; React components render domain-specific UI states rather than raw transport results.
- **Plain HTTP remains intentional** for media bytes (`/stream/:compositeTrackId`), health, static assets, Vite middleware, and the Android media bridge.

Stale `/trpc/*` requests are compatibility failures, not a live transport: they intentionally fail closed instead of falling through to app/static routes.

## Source Abstraction Layer (src/sources/)

Unified interface for multiple music backends. Sources implement capability
interfaces: `SearchCapability`, `PlaylistCapability`, `StreamCapability`, `AlbumCapability`.

### SourceCatalog RPC seam (server/rpc/services/sourceCatalog.ts)

`SourceCatalog` is the RPC-facing source contract seam. RPC handlers pass Pyxis/domain ids such as `ytmusic:album_1`, `ytmusic:playlist_1`, or library track nanoids; they do not resolve `SourceManager` instances or split source-prefixed ids for search, album, playlist, track metadata, or stream URL operations.

`SourceCatalog` owns:

- resolving the active `SourceManager` for the request,
- validating source-prefixed ids for album and playlist operations,
- resolving opaque track ids to source capabilities for metadata and public `/stream/` URLs,
- checking source capabilities before invoking provider adapters,
- mapping source/provider failures into typed public RPC errors.

Raw source adapters in `src/sources/**` stay provider-specific. They expose canonical tracks, albums, playlists, and capability methods; they should not know about RPC wire errors, `/stream/` URL construction, or library/domain id validation.

A narrow transitional exception remains for library album save: the `Library` service still accepts a `getAlbumTracks`-capable manager while the library persistence seam is deepened.

### Pandora Source (src/sources/pandora/)

Self-contained Pandora client library:
- `client.ts` — Public API facade (login, getStationList, getPlaylist, search, etc.)
- `api/` — One file per Pandora API domain (auth, station, user, music, bookmark, track, call)
- `crypto/` — Blowfish ECB encryption for API payloads
- `http/` — HTTP client wrapper with fixture mode support
- `types/` — Pandora API request/response types, tagged errors, config types
- `quality.ts` — Audio quality abstraction
- `constants.ts` — API URL, device credentials
- `index.ts` — Source adapter wrapping client.ts into canonical Source interface

### YouTube Music Source (src/sources/ytmusic/)

- `index.ts` — Source adapter with search, playlist, album, stream capabilities
- `yt-dlp.ts` — Subprocess wrapper for yt-dlp calls
- `api-client.ts` — Internal YouTube Music API client
- `api-config.ts` — API base context and headers

## Authentication Flow (Pandora)

1. **Partner Login** (unencrypted)
   - POST auth.partnerLogin
   - Send device credentials (android)
   - Receive encrypted syncTime + partnerAuthToken
   - Decrypt syncTime, calculate offset

2. **User Login** (encrypted)
   - POST auth.userLogin
   - Encrypt payload with partner key
   - Include syncTime offset
   - Receive userAuthToken + userId

3. **Authenticated Calls**
   - POST <method>
   - Include auth_token, partner_id, user_id in URL
   - Encrypt JSON payload with Blowfish ECB
   - Include syncTime in payload

## Server Data Flow

```
Client Request → /rpc Effect RPC Handler → Service Layer
                                     ↓
                               Source Manager
                                     ↓
                            Pandora / YTMusic Source
                                     ↓
                               API Response → Client
```

## Database (src/db/)

PGlite (in-browser Postgres) with Drizzle ORM. Schema defines: albums,
album_source_refs, album_tracks, playlists, credentials.

## Error Handling

All Pandora errors use Effect's tagged error pattern:

```typescript
// Defined in src/sources/pandora/types/errors.ts
ApiCallError | SessionError | EncryptionError | DecryptionError |
PartnerLoginError | UserLoginError | ConfigError | NotFoundError
```

## Key Patterns

1. **Effect-TS** — All Pandora API operations return `Effect.Effect<T, E>`
2. **Readonly types** — All API types use `readonly` modifiers
3. **Tagged errors** — Discriminated union for type-safe error handling
4. **Source abstraction** — Canonical types normalize data across backends
5. **Session management** — Auth tokens managed server-side in memory, persisted to DB for auto-login
