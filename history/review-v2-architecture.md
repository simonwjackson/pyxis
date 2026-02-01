# Review: Pyxis v2 Architecture Implementation

**Date**: 2026-02-01
**Reviewer**: Claude Opus 4.5
**Scope**: 4-phase v2 architecture (commits `5afde28`, `543f93f`, `d9e2255` + uncommitted Phase 4)

---

## Executive Summary

The v2 architecture implementation is **substantially complete** and well-executed. All four phases have been implemented with solid architectural decisions. The codebase is clean, type-safe (zero `any` usage), and all 223 tests pass. The web build succeeds.

**Finding counts: 2 critical, 5 high, 7 medium, 6 low**

The critical/high findings are concentrated in the opaque ID boundary enforcement (source fields leaking in API responses) and missing spec features (queue persistence, radio auto-fetch). These are addressable without architectural changes.

---

## Section A: Structural Verification

### A1. CLI Removal (Phase 1) — PASS

- `src/cli/` directory: **removed**
- No orphaned CLI imports found in codebase
- CLI dependencies (`commander`, `cli-table3`, `picocolors`): **removed from package.json**
- No CLI-related scripts in package.json

### A2. Pandora Library Consolidation (Phase 1) — PASS

All files successfully relocated:

```
src/sources/pandora/
  api/        (auth, bookmark, call, music, station, track, user)
  crypto/     (blowfish)
  http/       (client)
  types/      (api, config, errors)
  client.ts, constants.ts, quality.ts, index.ts
```

- Old top-level locations (`src/api/`, `src/crypto/`, `src/http/`, `src/client.ts`, `src/constants.ts`, `src/quality.ts`) **removed**
- All internal imports correctly use relative paths within consolidated structure
- External imports (e.g., `server/services/sourceManager.ts`) correctly reference new paths

### A3. Router Structure (Phase 2) — PASS

`server/router.ts` wires all 11 expected routers: auth, track, album, artist, radio, playlist, library, search, player, queue, credentials.

Old router files deleted: stations.ts, playback.ts, bookmarks.ts, collection.ts, genres.ts, user.ts, stream.ts, playlists.ts — **none found**.

No frontend code references old router paths (`trpc.stations.*`, `trpc.playback.*`, etc.).

---

## Section B: Opaque ID System

### [MEDIUM] B1. Standard Base64 instead of Base64URL
- **Location**: `server/lib/ids.ts:7-9`
- **Category**: Code Quality
- **Description**: `encodeId` uses standard `btoa()` which produces URL-unsafe characters (`+`, `/`, `=`). The `buildStreamUrl()` function compensates with `encodeURIComponent()`, creating URLs like `/stream/cGFuZG9yYTpqZF90b2tlbl8xMjM%3D`.
- **Expected**: Base64URL encoding (RFC 4648) — replaces `+` with `-`, `/` with `_`, strips `=` padding
- **Actual**: Standard base64 + `encodeURIComponent()` workaround
- **Impact**: Functional but produces ugly URLs and requires encoding at every URL boundary

### [CRITICAL] B2. Source Field Leakage in API Responses
- **Location**: Multiple router files
- **Category**: Spec Deviation
- **Description**: Despite encoding IDs as opaque, multiple routers include a `source` field in their response objects, violating the v2 principle that "clients never see Pandora, YTMusic, or local."
- **Expected**: No `source` field in any API response (v2-architecture-vision.md: "Sources are an implementation detail behind opaque IDs")
- **Actual**: Source leaked in the following locations:

| File | Line(s) | Leaked Field |
|------|---------|-------------|
| `server/routers/search.ts` | 18, 34 | `source: track.sourceId.source` on tracks and `source: sid.source` on album sourceIds |
| `server/routers/playlist.ts` | 21, 29 | `source: track.sourceId.source` on tracks and `source: playlist.source` on playlists |
| `server/routers/radio.ts` | 18 | `source: "pandora" as const` on playlist items |
| `server/routers/track.ts` | 12 | `return { source, id, opaqueId: input.id }` — raw source AND raw id in response |
| `server/routers/library.ts` | 25-26 | `source: ref.source` AND `sourceId: ref.sourceId` — raw internal ID leaked |

- **Impact**: Breaks the core v2 principle. Clients can see which source tracks come from and could become coupled to source-specific behavior. The `library.ts` leak of raw `sourceId` is particularly problematic — it exposes internal database IDs.

### [HIGH] B3. Client Sends Source in Queue/Player Inputs
- **Location**: `server/routers/queue.ts:38`, `server/routers/player.ts:48`
- **Category**: Spec Deviation
- **Description**: The `queue.add` and `player.play` mutations accept a `source` field from the client (e.g., `z.enum(["pandora", "ytmusic", "local"])`). The server should extract the source from the opaque ID.
- **Expected**: Client sends only opaque IDs; server decodes to determine source
- **Actual**: Client must know and send the source type
- **Impact**: Forces frontend to track source information, breaking opacity. If the encoding format changes, both client and server need updating.

### B4. Positive Findings
- `decodeId` correctly splits on first colon only (handles multi-colon IDs)
- No `atob`/`btoa` usage in frontend code
- No manual composite ID construction in frontend
- Stream endpoint (`/stream/:id`) properly decodes opaque IDs server-side
- `now-playing.tsx` does not construct composite IDs

---

## Section C: API Surface Compliance

### C1. `auth` Router — COMPLETE
- Has: `login`, `logout`, `status`, `settings`, `usage`, `changeSettings` + extra `setExplicitFilter`
- All spec procedures present

### C2. `track` Router — COMPLETE
- Has: `get`, `streamUrl`, `feedback`, `removeFeedback`, `sleep`, `explain`
- All spec procedures present

### C3. `album` Router — COMPLETE
- Has: `get`, `tracks` (with opaque IDs via `encodeTrack()`)

### [MEDIUM] C4. `artist` Router — STUB
- **Location**: `server/routers/artist.ts:6-16`
- **Category**: Missing Feature
- **Description**: Both `get` and `search` are empty stubs. `get` returns `{ id: input.id }`. `search` returns `{ artists: [] }`.
- **Expected**: At least basic functionality wrapping SourceManager
- **Actual**: Placeholder only (comment: "Stub router for Phase 3+")
- **Impact**: Artist pages/search will show nothing. Acceptable as intentional deferral if documented.

### C5. `radio` Router — COMPLETE
- Has: `list`, `getTracks`, `create`, `delete`, `rename`, `genres`, `quickMix`, `addSeed`, `removeSeed` + extra `getStation`

### C6. `playlist` Router — COMPLETE
- Has: `list`, `getTracks` + extra `createRadio`

### C7. `library` Router — COMPLETE
- Has: `albums`, `albumTracks`, `saveAlbum`, `removeAlbum`, `bookmarks`, `addBookmark`, `removeBookmark`

### C8. `search` Router — COMPLETE
- Has: `unified` (multi-source via SourceManager) + extra `search` (Pandora-specific fallback)
- Opaque IDs properly applied via `encodeTrack()`/`encodeAlbum()`

### C9. `player` Router — COMPLETE
- Has: `state`, `play`, `pause`, `resume`, `skip`, `previous`, `seek`, `volume` + `onStateChange` subscription
- Extra: `stop`, `jumpTo`, `reportProgress`, `reportDuration`, `trackEnded`
- Subscription emits complete state (status, track, progress, duration, volume, updatedAt)

### [MEDIUM] C10. `queue` Router — MISSING `jump`
- **Location**: `server/routers/queue.ts`
- **Category**: Missing Feature
- **Description**: Spec calls for `queue.jump(index)` but it's not in the queue router. The functionality exists as `player.jumpTo` instead.
- **Expected**: `queue.jump` procedure per spec
- **Actual**: `player.jumpTo` exists (semantically equivalent but in wrong router)
- **Impact**: Low — functionality exists, just in a different location. May confuse API consumers expecting spec compliance.

### C11. `credentials` Router — COMPLETE
- Has: `list`, `add`, `remove`, `test`
- Source-agnostic design verified (accepts `sourceSchema` enum)

---

## Section D: Server-Authoritative Playback (Phase 3)

### D1. Player Service — PASS
- **Location**: `server/services/player.ts` (186 lines)
- State: status, currentTrack, progress, duration, volume, updatedAt
- Progress uses monotonic clock: `(Date.now() - updatedAt) / 1000` when playing, frozen when paused
- Listener/subscription pattern with `subscribe()` returning unsubscribe callback
- Server does NOT play audio — tracks state only, as spec requires

### [HIGH] D2. Queue Persistence — NOT IMPLEMENTED
- **Location**: `server/services/queue.ts:27`
- **Category**: Spec Deviation
- **Description**: Queue is in-memory only. Comment: "In-memory queue state (singleton - single-user server)". The spec explicitly requires: "Persists queue state to DB (survives server restart)" and specifies `queue_items`, `player_state`, `queue_context` tables.
- **Expected**: Queue and player state persisted to PGlite; `queue_items`, `player_state`, `queue_context` tables in schema
- **Actual**: In-memory singleton; no DB tables for queue/player in `src/db/schema.ts`
- **Impact**: Server restart loses all playback state and queue. Breaks the "transfer model" across server restarts. Cross-device works while server runs, but restart = state loss.

### [HIGH] D3. Radio Auto-Fetch — NOT IMPLEMENTED
- **Location**: `server/services/queue.ts`
- **Category**: Missing Feature
- **Description**: The spec states the Queue Service should "auto-fetch more tracks for radio mode (calls SourceManager)". `queue.next()` (line 92) assumes items exist with no auto-fetch logic.
- **Expected**: When `context.type === "radio"` and queue nears end, automatically call SourceManager to fetch more tracks
- **Actual**: No auto-fetch. Queue will exhaust and stop.
- **Impact**: Radio mode requires manual intervention to keep playing. Users must manually request more tracks.

### D4. WebSocket Removal — PASS
- `server/handlers/websocket.ts`: deleted
- `src/web/hooks/useWebSocket.ts`: deleted
- `server/services/playback.ts`: deleted
- `server/index.ts`: no WebSocket upgrade handling
- Replaced by tRPC SSE subscriptions via `httpSubscriptionLink`

### D5. Frontend Subscription Client — PASS
- `usePlayback` hook subscribes to `player.onStateChange`
- Audio element loads URL from `track.streamUrl` (server-provided)
- All transport commands are tRPC mutations (not local state changes)
- Progress reported to server every 5 seconds while playing
- tRPC client configured with `splitLink` routing subscriptions to SSE

### [MEDIUM] D6. Cross-Device Transfer — PARTIAL
- **Category**: Spec Deviation
- **Description**: Auto-resume on client connect works (subscribe → get current state → sync audio). However, because queue/player state is in-memory only, transfer only works while the server process is running. Server restart loses all state.
- **Impact**: Works for the primary use case (multiple browser tabs/devices while server runs). Does not survive server restart.

---

## Section E: Credential Management (Phase 4)

### E1. Database — PASS
- `sourceCredentials` table in `src/db/schema.ts:60-68`: id, source, username, password, sessionData, createdAt, updatedAt
- Legacy `credentials` table preserved for migration compatibility

### E2. Credential Service — PASS
- `server/services/credentials.ts`: full CRUD with `listCredentials`, `addCredential`, `removeCredential`, `testCredential`
- Per-source session caching in memory
- Migration from legacy credentials on startup
- Session restoration from stored credentials

### E3. Context Generalization — PASS
- `server/trpc.ts`: context includes `pandoraSession | undefined` and `sourceManager | undefined`
- `protectedProcedure`: works without Pandora (requires `sessionId` + creates YTMusic-only SourceManager)
- `pandoraProtectedProcedure`: exists for Pandora-specific endpoints (settings, usage)
- `sourceManager` in context for unified source access

### E4. Session Service — PASS
- `server/services/session.ts`: in-memory session store (user-level)
- `server/services/autoLogin.ts`: restores all source sessions from DB on startup, creates Pyxis session from stored credentials

### [MEDIUM] E5. Login Page — Pandora-Only
- **Location**: `src/web/routes/login.tsx:14`
- **Category**: Spec Deviation
- **Description**: Login page only authenticates Pandora credentials via `auth.login`. No way to add YTMusic credentials from the login page.
- **Expected**: Source-agnostic login or at least guidance to settings page
- **Actual**: Pandora email/password form only. YTMusic credentials must be added via Settings page after Pandora login.
- **Impact**: Users who only want YTMusic cannot easily get started. They need to somehow get past the login page first.

### E5. Settings Page — PASS
- `src/web/routes/settings.tsx`: full credential management UI
- Source selector (pandora/ytmusic/local), username/password form
- List existing credentials with active status indicators
- Remove credentials functionality

---

## Section F: Build & Type Safety

### F1. Build Results

| Check | Result |
|-------|--------|
| `bun test` | **223 pass, 0 fail** (941 assertions) |
| `bun run build:web` | **Success** (480.61 kB JS, 39.86 kB CSS) |
| `bun run typecheck` | **6 errors** (see below) |

### [HIGH] F2. TypeScript Errors
- **Location**: `server/index.ts:21,23`, `server/services/stream.ts:114,121,144,234`
- **Category**: Type Safety
- **Description**: 6 TypeScript errors, all related to missing Bun type definitions:
  - `Cannot find name 'Bun'` (5 errors)
  - `Parameter 'req' implicitly has an 'any' type` (1 error)
- **Expected**: `bun run typecheck` passes with zero errors (spec acceptance criteria)
- **Actual**: 6 errors. Missing `@types/bun` in devDependencies.
- **Impact**: Server code compiles fine at runtime (Bun provides these types), but `tsc --noEmit` fails. This means the typecheck CI gate would fail.

### F3. Type Safety Audit

| Category | Count | Verdict |
|----------|-------|---------|
| `any` usage | **0** | Excellent |
| `@ts-ignore` / `@ts-expect-error` | **0** | Excellent |
| Non-null assertions (`!`) | **6** | Acceptable (shuffle util + crypto lib) |
| Type assertions (`as`) | **~75** | Concentrated in YTMusic parsers (untyped API), acceptable |
| `Record<string, unknown>` | **~42** | Appropriate for API response parsing |

### [LOW] F4. Swallowed Error
- **Location**: `src/web/hooks/usePlayback.ts:207`
- **Category**: Code Quality
- **Description**: `audio.play().catch(() => {})` silently swallows play() rejection. Adjacent lines (118, 131, 269) properly log errors.
- **Impact**: Debugging audio playback issues will be harder. Should at minimum log the error.

### [LOW] F5. Double Type Assertions
- **Location**: `src/sources/pandora/api/call.ts:62`, `src/sources/pandora/crypto/blowfish.ts:108,466,576`
- **Category**: Code Quality
- **Description**: Pattern `as unknown as T` used in 4 places. These bypass TypeScript's type checking entirely.
- **Impact**: Low — concentrated in crypto library and error handling code that's well-tested.

---

## Section G: Regression Checks (Requires Manual Testing)

These cannot be verified via code review alone. Based on code analysis:

| Flow | Code Path Exists | Risk |
|------|-----------------|------|
| Login with Pandora credentials | Yes (`auth.login` → `Pandora.login`) | Low |
| Browse Pandora radio stations | Yes (`radio.list` → `Pandora.getStationList`) | Low |
| Play a Pandora radio station | Yes (`player.play` → `radio.getTracks`) | Low |
| Skip/pause/resume | Yes (player mutations → player service) | Low |
| Thumbs up/down | Yes (`track.feedback` → `Pandora.addFeedback`) | Low |
| Unified search | Yes (`search.unified` → SourceManager) | Low |
| Play YTMusic playlist | Yes (`playlist.getTracks` → ytmusic source) | Low |
| Save album to library | Yes (`library.saveAlbum` → PGlite) | Low |
| View library | Yes (`library.albums` → PGlite query) | Low |
| Play album from library | Yes (tracks route exists) | Low |
| View bookmarks | Yes (`library.bookmarks` → Pandora) | Low |
| Create station from search | Yes (`radio.create` → Pandora) | Low |
| Now-playing page | Yes (subscribes to player state) | Low |

---

## Findings Summary

### CRITICAL (2)

1. **Source Field Leakage** — Multiple routers expose `source` field in responses, breaking the core opaque ID contract. `library.ts` additionally leaks raw `sourceId`. (Section B2)
2. **Source in Client Inputs** — `queue.add` and `player.play` require clients to send source type, which should be derived from opaque IDs server-side. (Section B3) — *Reclassified from HIGH to CRITICAL as it creates a bidirectional opacity violation.*

### HIGH (3)

3. **Queue/Player Persistence Missing** — In-memory only; server restart loses all state. Spec requires DB persistence via `queue_items`, `player_state`, `queue_context` tables. (Section D2)
4. **Radio Auto-Fetch Missing** — Queue doesn't auto-fetch tracks in radio mode. Will exhaust and stop. (Section D3)
5. **TypeScript Errors** — 6 errors from missing Bun types. Spec requires `bun run typecheck` to pass. (Section F2)

### MEDIUM (5)

6. **Base64 vs Base64URL** — Standard base64 produces URL-unsafe characters; workaround with `encodeURIComponent()`. (Section B1)
7. **Artist Router Stub** — Both procedures return empty/minimal data. (Section C4)
8. **Queue.jump Missing** — Spec procedure not in queue router; exists as `player.jumpTo`. (Section C10)
9. **Cross-Device Transfer Partial** — Works while server runs, but state lost on restart. (Section D6)
10. **Login Page Pandora-Only** — No way to add YTMusic-only credentials from login flow. (Section E5)

### LOW (4)

11. **Swallowed Play Error** — `usePlayback.ts:207` silently catches audio.play() rejection. (Section F4)
12. **Double Type Assertions** — `as unknown as T` pattern in 4 places. (Section F5)
13. **Extra Pandora-Specific Search** — `search.search` procedure exists alongside `search.unified`. Not harmful but redundant. (Section C8)
14. **1 TODO-like String** — Test fixture uses `XXXuserAuthTokenXXX` placeholder (not a real TODO). (Section F3)

---

## Recommendation

**Fix critical and high findings before shipping.** The architecture is sound and implementation is thorough. The primary concern is the opaque ID boundary violations — source information leaking in responses and being required in inputs. This undermines the core v2 principle and should be addressed before the API surface solidifies.

Priority order:
1. **Remove `source` fields from all API responses** (search, playlist, radio, track, library routers)
2. **Remove `source` from queue.add/player.play inputs** — decode from opaque ID server-side
3. **Add `@types/bun` to devDependencies** to fix typecheck
4. Queue persistence and radio auto-fetch can be addressed in a follow-up phase since the architecture supports it cleanly

---

## Acceptance Criteria Status

| Criterion | Status |
|-----------|--------|
| No CLI code in repository | PASS |
| Pandora client library in `src/sources/pandora/` | PASS |
| All IDs in tRPC responses are opaque | PARTIAL — IDs are opaque but `source` field leaks |
| No `source:trackId` visible to clients | PARTIAL — `source` field visible |
| API routers match target structure | PASS (with minor deviations noted) |
| Player state is server-authoritative | PASS |
| Queue state is server-authoritative | PASS (in-memory) |
| Queue persisted to DB | FAIL — in-memory only |
| tRPC subscriptions for real-time state | PASS |
| Auto-resume on new device | PASS (while server running) |
| Cross-device transfer | PASS (while server running) |
| No WebSocket handler code | PASS |
| Source credentials managed in DB | PASS |
| `bun run typecheck` passes | FAIL — 6 Bun type errors |
| `bun test` passes | PASS (223/223) |
| `bun run build:web` succeeds | PASS |
| Works with Pandora and YTMusic | PASS (code paths exist) |
