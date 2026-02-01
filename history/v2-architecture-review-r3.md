# Pyxis v2 Architecture Review — Round 3

**Date**: 2026-02-01
**Reviewer**: Claude Opus 4.5
**Scope**: 4-phase v2 architecture implementation vs spec

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 2 |
| MEDIUM | 5 |
| LOW | 4 |

**Recommendation**: Fix HIGH items before shipping. MEDIUM items are acceptable tech debt with tracking issues.

---

## Section A: Structural Verification

### A1. CLI Removal (Phase 1) — PASS

- `src/cli/` directory does not exist
- No orphaned imports reference CLI paths
- No CLI dependencies (`commander`, `cli-table3`, `picocolors`) in `package.json`
- No CLI scripts in `package.json`

### A2. Pandora Library Consolidation (Phase 1) — PASS

- `src/api/`, `src/crypto/`, `src/http/` do not exist at top level
- All files correctly located under `src/sources/pandora/`
- `src/client.ts`, `src/constants.ts`, `src/quality.ts` do not exist at top level
- `src/types/api.ts`, `src/types/errors.ts` do not exist at top level
- No import paths reference old locations

### A3. Router Structure (Phase 2) — PASS

- `server/router.ts` wires exactly 11 routers: auth, track, album, artist, radio, playlist, library, search, player, queue, credentials
- Old router files deleted: stations.ts, playback.ts, bookmarks.ts, collection.ts, genres.ts, user.ts, stream.ts, playlists.ts
- No frontend code references old router paths (`trpc.stations.*`, `trpc.playback.*`, etc.)

---

## Section B: Opaque ID System

### B1. Encoding Implementation — PASS

- `server/lib/ids.ts` implements `encodeId`/`decodeId` with base64url encoding
- `decodeId` uses `indexOf(":")` to split on first colon only — correct
- Base64url variant used (`+`→`-`, `/`→`_`, padding stripped) — URL-safe

### B2. Boundary Enforcement — PARTIAL (see findings below)

### B3. Consistency — PARTIAL (see findings below)

### [HIGH] Raw Pandora Tokens Leak to Frontend via Search and Bookmarks

- **Location**: `server/routers/search.ts:65-66`, `server/routers/library.ts:131-135`
- **Category**: Spec Deviation
- **Description**: Two paths leak raw Pandora identifiers to the frontend:
  1. `search.unified` returns `pandoraArtists` and `pandoraGenres` containing raw `musicToken` values (search.ts:65-66). These are passed through from `Pandora.search()` without encoding.
  2. `library.bookmarks` returns raw `GetBookmarksResponse` from Pandora without any ID encoding (library.ts:131-135). The response includes raw `bookmarkToken`, `musicToken`, `artUrl`, etc.
- **Expected**: All identifiers crossing the server→client boundary should be opaque-encoded.
- **Actual**: Frontend directly uses `artist.musicToken`, `song.musicToken`, `genre.musicToken`, `a.bookmarkToken` (confirmed in `src/web/components/search/SearchResults.tsx:185-263`, `src/web/routes/bookmarks.tsx:55-143`).
- **Impact**: Breaks the opaque ID abstraction. If the encoding scheme changes or a second source adds similar entities, these raw tokens will need migration. Station creation via `radio.create` also accepts raw `musicToken` (radio.ts:124-125).

### [HIGH] `search.search` Returns Entirely Raw Pandora Response

- **Location**: `server/routers/search.ts:37-43`
- **Category**: Spec Deviation
- **Description**: The `search.search` procedure (Pandora-specific) returns the raw `Pandora.search()` response without any ID encoding. This includes raw `musicToken`, `trackToken`, `artistName` etc.
- **Expected**: Per opaque ID spec, this procedure should either be removed (replaced by `search.unified`) or should encode all IDs.
- **Actual**: Raw response passed through.
- **Impact**: Any client using `search.search` receives unencoded Pandora tokens. Currently used indirectly via the `AddSeedDialog` component which passes `musicToken` to `radio.addSeed`.

---

## Section C: API Surface Compliance

| Router | Spec Procedures | Implemented | Missing | Extra |
|--------|-----------------|-------------|---------|-------|
| auth | 6 | 8 | 0 | guestLogin, setExplicitFilter |
| track | 6 | 6 | 0 | — |
| album | 2 | 2 | 0 | — |
| artist | 2 | 2 | 0 | — |
| radio | 9 | 10 | 0 | getStation |
| playlist | 2 | 3 | 0 | createRadio |
| library | 7 | 7 | 0 | — |
| search | 1 | 2 | 0 | search (Pandora-specific) |
| player | 9 | 14 | 0 | stop, jumpTo, reportProgress, reportDuration, trackEnded |
| queue | 7 | 7 | 0 | — |
| credentials | 4 | 4 | 0 | — |

**All 55 spec procedures implemented. 10 extra procedures (extensions, not deviations).**

### [MEDIUM] `artist.get` Returns `source` Field to Client

- **Location**: `server/routers/artist.ts:13-17`
- **Category**: Spec Deviation
- **Description**: `artist.get` returns `{ id, name: "Unknown", source: decoded.source }` — the `source` field exposes the decoded source type (e.g., "pandora", "ytmusic") to the client.
- **Expected**: Clients should not need to know the source. Capabilities should be used instead.
- **Actual**: Source string returned as part of artist response.
- **Impact**: Minor abstraction leak. If the frontend uses this to branch behavior, it couples UI to source types.

### [MEDIUM] `radio.create` Accepts Raw Pandora Tokens

- **Location**: `server/routers/radio.ts:112-139`
- **Category**: Spec Deviation
- **Description**: The `create` mutation accepts `musicToken` and `trackToken` as raw Pandora strings (not opaque IDs). Uses `Record<string, unknown>` with `as` cast to build input.
- **Expected**: Input should accept opaque IDs that get decoded server-side.
- **Actual**: Raw tokens from search results flow through directly.
- **Impact**: Couples station creation to Pandora's token format. The `Record<string, unknown>` + `as` cast bypasses type safety.

### [MEDIUM] `library.removeBookmark` Uses Raw `bookmarkToken`

- **Location**: `server/routers/library.ts:161-183`
- **Category**: Spec Deviation
- **Description**: `removeBookmark` accepts a raw `bookmarkToken` string, not an opaque ID. This is because `library.bookmarks` returns raw Pandora data without encoding.
- **Expected**: Bookmark tokens should be opaque-encoded when returned by `bookmarks`, then decoded when received by `removeBookmark`.
- **Actual**: Raw Pandora bookmark tokens used as-is.
- **Impact**: Consistent with `bookmarks` returning raw data, but both are spec deviations from the opaque ID system.

---

## Section D: Server-Authoritative Playback (Phase 3)

### D1. Player Service — PASS

- `server/services/player.ts` exists (224 lines)
- Owns: status, currentTrack, nextTrack, progress, duration, volume, updatedAt
- Progress uses `Date.now()` monotonic calculation (lines 60-66)
- State persisted to DB via debounced saves (1s debounce in persistence.ts)
- `restoreFromDb()` restores to "paused" on server restart (line 206)
- Emits via listener set pattern consumed by tRPC subscriptions

### D2. Queue Service — PASS

- `server/services/queue.ts` exists (194 lines)
- Maintains ordered track list with currentIndex
- Persisted to `queue_items` + `queue_state` tables
- Context types: radio, album, playlist, manual
- Auto-fetch: threshold of 2 remaining tracks, async error-tolerant

### D3. Database Schema — PASS

- `src/db/schema.ts` defines: `playerState` (lines 71-78), `queueItems` (lines 80-90), `queueState` (lines 92-97), `sourceCredentials` (lines 61-69)
- Column names, types, defaults all appropriate

### D4. WebSocket Removal — PASS

- `server/handlers/` directory does not exist
- No `useWebSocket.ts` in frontend hooks
- No `server/services/playback.ts` (old WS-based)
- `server/index.ts` uses tRPC SSE subscriptions only, no WebSocket upgrade

### D5. Frontend Subscription Client — PASS

- `src/web/hooks/usePlayback.ts` subscribes to `player.onStateChange`
- Audio element `src` set from server state `track.streamUrl`
- Transport commands are tRPC mutations (play, pause, resume, skip, previous, seek, volume)
- Progress reported to server every 5s (silent update, no notify loop)
- Server state restored on client connect

### D6. Cross-Device — ARCHITECTURE ENABLED

- Server singleton pattern: all tabs hit same state
- SSE subscriptions deliver real-time updates to all connected clients
- Any tab's mutation updates server → all tabs receive notification

---

## Section E: Credential Management (Phase 4)

### E1. Database — PASS

- `source_credentials` table in `src/db/schema.ts:61-69`
- Schema: id, source, username, password, sessionData, createdAt, updatedAt

### E2. Credential Service — PASS

- `server/services/credentials.ts` exists
- Functions: listCredentials, addCredential, removeCredential, testCredential
- `getPandoraSessionFromCredentials()` for context fallback
- `restoreAllSessions()` re-authenticates on startup
- `migrateLegacyCredentials()` for backwards compatibility

### E3. Context Generalization — PASS

- `server/trpc.ts` context includes optional `pandoraSession` and `sourceManager`
- `protectedProcedure` works without Pandora session (YTMusic-only)
- `pandoraProtectedProcedure` exists for Pandora-specific endpoints
- `sourceManager` in context, falls back to YTMusic-only via `ensureSourceManager()`

### E4. Session Service — PASS

- `server/services/session.ts` is source-agnostic
- `server/services/autoLogin.ts` handles startup orchestration
- Auto-login from stored credentials, legacy migration, playback restore

### E5. Frontend — PASS

- Settings page (`src/web/routes/settings.tsx`) manages source credentials
- Login page (`src/web/routes/login.tsx`) supports Pandora login + guest mode
- Guest login creates YTMusic-only session

### [LOW] `protectedProcedure` Non-Null Assertion on `sourceManager`

- **Location**: `server/trpc.ts:56`
- **Category**: Type Safety
- **Description**: `protectedProcedure` uses `ctx.sourceManager!` non-null assertion. While `createContext` always creates a sourceManager (either full or YTMusic-only), the type says `SourceManager | undefined`. The `!` assertion is justified by implementation but not by the type contract.
- **Expected**: Either narrow the type or add a runtime check before assertion.
- **Actual**: Non-null assertion used.
- **Impact**: If `createContext` logic changes and fails to create a sourceManager, this would throw at runtime rather than at the type check boundary.

---

## Section F: Build & Type Safety

### Builds — ALL PASS

- `bun run typecheck`: 0 errors
- `bun test`: 223 tests pass, 0 failures (2.47s across 11 files)
- `bun run build:web`: successful (480.76 kB JS, 39.11 kB CSS)

### [LOW] `as SourceType` Casts from DB Strings (8 occurrences)

- **Location**: `server/lib/ids.ts:80`, `server/services/persistence.ts:180`, `server/services/stream.ts:72`, `server/services/credentials.ts:34,131`, `server/routers/library.ts:25,41,47`
- **Category**: Type Safety
- **Description**: Database `text` columns storing source types are cast with `as SourceType` without runtime validation. If invalid data enters the DB, these casts silently produce incorrect types.
- **Expected**: Use Zod parse or a validation function at the DB read boundary.
- **Actual**: Bare `as` casts.
- **Impact**: Low risk — data is written by the application itself, but violates defense-in-depth.

### [LOW] `Record<string, unknown>` with `as` Cast for Dynamic Inputs

- **Location**: `server/routers/radio.ts:123,136`, `server/routers/auth.ts:135,140`
- **Category**: Type Safety
- **Description**: `radio.create` and `auth.changeSettings` build dynamic objects using `Record<string, unknown>` then cast them with `as Parameters<...>`. This bypasses compile-time type checking of the Pandora API contract.
- **Expected**: Use properly typed optional fields or a builder pattern.
- **Actual**: Type-unsafe dynamic construction.
- **Impact**: If the Pandora client function signature changes, these casts will silently pass incorrect data.

### No Suppressions

- 0 `@ts-ignore` / `@ts-expect-error` comments
- 0 `eslint-disable` comments
- 0 `any` type usage
- 0 `console.log` statements in server code
- 0 TODO/FIXME/HACK comments

---

## Section G: Regression Checks

Cannot execute runtime regression tests (no live Pandora credentials in review environment). The following are assessed by code path analysis:

| Flow | Assessment | Notes |
|------|------------|-------|
| Login with Pandora credentials | Code path intact | auth.login → addCredential → createSession |
| Browse radio stations | Code path intact | radio.list → getStationList |
| Play radio station | Code path intact | player.play → queue → stream proxy |
| Skip/pause/resume | Code path intact | tRPC mutations → PlayerService |
| Thumbs up/down | Code path intact | track.feedback → addFeedback |
| Unified search | Code path intact | search.unified → searchAll |
| Play YTMusic playlist | Code path intact | playlist.getTracks → sourceManager |
| Save album to library | Code path intact | library.saveAlbum → DB insert |
| View library | Code path intact | library.albums → DB query |
| Play album from library | Code path intact | player.play with album context |
| View bookmarks | Code path intact | library.bookmarks → getBookmarks |
| Create station from search | **Raw token path** | Uses musicToken directly (see HIGH finding) |
| Now-playing page | Code path intact | usePlayback subscription → track state |

---

## Detailed Findings

### [HIGH] 1. Raw Pandora Tokens Leak to Frontend via Search and Bookmarks

- **Location**: `server/routers/search.ts:65-66`, `server/routers/library.ts:131-135`, `src/web/components/search/SearchResults.tsx:185-263`, `src/web/routes/bookmarks.tsx:55-143`
- **Category**: Spec Deviation
- **Description**: `search.unified` returns `pandoraArtists` and `pandoraGenres` with raw `musicToken` values. `library.bookmarks` returns the raw Pandora `GetBookmarksResponse` including raw `bookmarkToken` and `musicToken`. These flow directly to frontend components.
- **Expected**: All server→client identifiers should be opaque-encoded per the Phase 2 spec.
- **Actual**: Raw Pandora tokens used by frontend for station creation, bookmark removal, and seed management.
- **Impact**: Breaks opaque ID abstraction for search results (artists/genres) and bookmarks. Frontend is coupled to Pandora token format for these flows.

### [HIGH] 2. `search.search` Returns Entirely Raw Pandora Response

- **Location**: `server/routers/search.ts:37-43`
- **Category**: Spec Deviation
- **Description**: The Pandora-specific `search.search` procedure passes through the raw Pandora API response without any ID encoding. This includes `musicToken`, `trackToken`, and other Pandora-specific identifiers.
- **Expected**: Either remove this procedure (replaced by `search.unified`) or encode all IDs in the response.
- **Actual**: Raw Pandora response returned to client.
- **Impact**: Any feature using this endpoint receives unencoded tokens. Used via `AddSeedDialog` which passes raw `musicToken` to `radio.addSeed`.

### [MEDIUM] 3. `artist.get` Exposes Source Type to Client

- **Location**: `server/routers/artist.ts:16`
- **Category**: Spec Deviation
- **Description**: Returns `source: decoded.source` in the response, exposing the source backend type.
- **Expected**: Capabilities-based approach, not source identity.
- **Actual**: Source string returned.
- **Impact**: Minor abstraction leak. Frontend could branch on source type instead of capabilities.

### [MEDIUM] 4. `radio.create` Accepts Raw Pandora Tokens

- **Location**: `server/routers/radio.ts:112-139`
- **Category**: Spec Deviation
- **Description**: Accepts `musicToken` and `trackToken` as raw strings. Uses `Record<string, unknown>` to build input then casts.
- **Expected**: Accept opaque IDs, decode server-side.
- **Actual**: Raw tokens accepted.
- **Impact**: Couples station creation to Pandora token format. Type safety bypassed.

### [MEDIUM] 5. `library.removeBookmark` Uses Raw `bookmarkToken`

- **Location**: `server/routers/library.ts:161-183`
- **Category**: Spec Deviation
- **Description**: Accepts raw `bookmarkToken` input, not an opaque ID.
- **Expected**: Opaque ID input, decoded server-side.
- **Actual**: Raw Pandora token.
- **Impact**: Consistent with `bookmarks` returning raw data but both deviate from spec.

### [MEDIUM] 6. Pandora Search Artists/Genres Not Opaque-Encoded

- **Location**: `server/routers/search.ts:52-59`, `server/routers/search.ts:65-66`
- **Category**: Spec Deviation
- **Description**: `pandoraArtists` and `pandoraGenres` in `search.unified` response contain raw Pandora data including `musicToken` fields.
- **Expected**: Encode `musicToken` values with `encodeId("pandora", ...)`.
- **Actual**: Pass-through of raw Pandora types.
- **Impact**: Frontend components (`SearchResults.tsx`, `AddSeedDialog.tsx`, `genres.tsx`) use raw `musicToken` for station creation.

### [MEDIUM] 7. Genre Station IDs Not Opaque-Encoded

- **Location**: `server/routers/radio.ts:163-168`
- **Category**: Spec Deviation
- **Description**: `radio.genres` returns raw `result.categories` from Pandora without encoding station IDs/tokens.
- **Expected**: Genre station tokens should be opaque-encoded.
- **Actual**: Raw Pandora category data.
- **Impact**: `src/web/routes/genres.tsx:74` uses raw `musicToken` from genre data.

### [LOW] 8. Non-Null Assertion in `protectedProcedure`

- **Location**: `server/trpc.ts:56,77`
- **Category**: Type Safety
- **Description**: `ctx.sourceManager!` non-null assertion used without runtime guard.
- **Expected**: Runtime check or narrowed type.
- **Actual**: Non-null assertion.
- **Impact**: If `createContext` changes, silent runtime error possible.

### [LOW] 9. `as SourceType` Casts from DB Strings

- **Location**: 8 occurrences across `server/lib/ids.ts`, `server/services/`, `server/routers/library.ts`
- **Category**: Type Safety
- **Description**: DB text columns cast to `SourceType` without runtime validation.
- **Expected**: Zod parse or validation at DB read boundary.
- **Actual**: Bare `as` casts.
- **Impact**: Low — data written by application, but no defense-in-depth.

### [LOW] 10. Type-Unsafe Dynamic Object Construction

- **Location**: `server/routers/radio.ts:123,136`, `server/routers/auth.ts:135,140`
- **Category**: Type Safety
- **Description**: `Record<string, unknown>` used to build Pandora API inputs, then cast with `as Parameters<...>`.
- **Expected**: Typed optional fields or builder pattern.
- **Actual**: Untyped object construction.
- **Impact**: Pandora client signature changes would not be caught at compile time.

### [LOW] 11. Stub Artist Implementation

- **Location**: `server/routers/artist.ts:9-17`
- **Category**: Missing Feature
- **Description**: `artist.get` returns hardcoded `name: "Unknown"` — it's a placeholder that decodes the ID but has no actual artist data.
- **Expected**: Full artist metadata (or clearly marked as unimplemented).
- **Actual**: Stub with hardcoded name.
- **Impact**: Low — artist detail page would show "Unknown" for all artists. No dedicated artist API exists in Pandora or YTMusic to populate this.

---

## Review Checklist Completion

- [x] Section A: Structural Verification — all checks passed
- [x] Section B: Opaque ID System — 2 HIGH, 2 MEDIUM findings
- [x] Section C: API Surface — all 55 procedures verified, 2 MEDIUM findings
- [x] Section D: Server-Authoritative Playback — all checks passed
- [x] Section E: Credential Management — all checks passed, 1 LOW finding
- [x] Section F: Build & Type Safety — all builds pass, 3 LOW findings
- [x] Section G: Regression Checks — code path analysis complete

**Final Count: 0 critical, 2 high, 5 medium, 4 low**

**Recommendation**: The HIGH findings are about raw Pandora tokens leaking through the opaque ID boundary in search results, bookmarks, and genre data. This is a systemic issue affecting 3 routers and ~6 frontend components. Fix before shipping if opaque ID integrity matters for future multi-source work. The remaining MEDIUM/LOW items are acceptable tech debt.
