# Architecture

## System Overview

```
Web Frontend (src/web/)
  React + TanStack Router + tRPC client
  Connects to backend via proxied /trpc endpoint
            ↓
tRPC Server (server/)
  router.ts         Combined tRPC router
  trpc.ts           Context factory, auth middleware
  routers/          Route handlers by domain
  services/         Business logic (session, playback, stream, source manager)
  handlers/         WebSocket handler
            ↓
Source Manager (src/sources/)
  index.ts          SourceManager aggregates all sources
  types.ts          Canonical types, capability interfaces
  pandora/          Pandora source (full client library)
  ytmusic/          YouTube Music source (yt-dlp + internal API)
            ↓
Pandora JSON API v5         YouTube Music (yt-dlp)
```

## Source Abstraction Layer (src/sources/)

Unified interface for multiple music backends. Sources implement capability
interfaces: `SearchCapability`, `PlaylistCapability`, `StreamCapability`, `AlbumCapability`.

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
Client Request → tRPC Router → Service Layer
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
