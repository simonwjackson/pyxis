# Review: Pyxis v2 Architecture Implementation

## Goal

Verify that the 4-phase v2 architecture implementation matches the spec in `v2-architecture-vision.md` and `phase2-opaque-ids-api-reshape.md`. Identify bugs, spec deviations, missing functionality, and regressions.

This is a **code review**, not an implementation task. Do not fix anything — report findings.

---

## Review Scope

4 phases were implemented across 3 commits + 1 uncommitted changeset:

| Phase | Commit | Status |
|-------|--------|--------|
| Phase 1: CLI removal + Pandora lib fold | `5afde28` | Committed |
| Phase 2: Opaque IDs + API reshape | `543f93f` | Committed |
| Phase 3: Server-authoritative player + queue | `d9e2255` | Committed |
| Phase 4: Credential management + source sessions | Uncommitted (17 files) | In progress |

---

## Review Checklist

### A. Structural Verification

**A1. CLI Removal (Phase 1)**
- [ ] Verify `src/cli/` directory no longer exists
- [ ] Verify no orphaned imports reference `src/cli/` anywhere in codebase
- [ ] Verify CLI dependencies removed from `package.json` (`commander`, `cli-table3`, `picocolors`)
- [ ] Verify `package.json` scripts don't reference CLI commands

**A2. Pandora Library Consolidation (Phase 1)**
- [ ] Verify `src/api/`, `src/crypto/`, `src/http/` no longer exist at top level
- [ ] Verify these files now live under `src/sources/pandora/api/`, `src/sources/pandora/crypto/`, `src/sources/pandora/http/`
- [ ] Verify `src/client.ts`, `src/constants.ts`, `src/quality.ts` moved to `src/sources/pandora/`
- [ ] Verify `src/types/api.ts` and `src/types/errors.ts` moved to `src/sources/pandora/types/`
- [ ] Verify no import paths reference the old locations

**A3. Router Structure (Phase 2)**
- [ ] Verify `server/router.ts` wires exactly these routers: `auth`, `track`, `album`, `artist`, `radio`, `playlist`, `library`, `search`, `player`, `queue`, `credentials`
- [ ] Verify old routers deleted: `stations.ts`, `playback.ts`, `bookmarks.ts`, `collection.ts`, `genres.ts`, `user.ts`, `stream.ts`, `playlists.ts` (note: some may have been renamed rather than deleted — check that old *procedures* don't exist)
- [ ] Verify no frontend code references old router paths (e.g., `trpc.stations.*`, `trpc.playback.*`, `trpc.bookmarks.*`, `trpc.collection.*`)

---

### B. Opaque ID System

**B1. Encoding Implementation**
- [ ] Verify `server/lib/ids.ts` exists with `encodeId` and `decodeId` functions
- [ ] Verify encoding is base64 of `source:id` format
- [ ] Verify `decodeId` properly handles the first colon (IDs themselves may contain colons)
- [ ] Verify encoding is URL-safe (base64 with `+/=` chars may break in URLs — check if URL encoding is applied or if base64url variant is used)

**B2. Boundary Enforcement**
- [ ] Grep all tRPC router files for raw `sourceId`, `source:`, or `.source` in responses — none should leak
- [ ] Grep frontend code (`src/web/`) for `sourceId`, `source:`, `atob`, `btoa` — clients should never decode IDs
- [ ] Verify `/stream/:id` endpoint accepts opaque IDs and decodes server-side
- [ ] Check `now-playing.tsx` no longer manually constructs composite IDs like `` `${source}:${trackId}` ``

**B3. Consistency**
- [ ] Verify all entity responses (tracks, albums, playlists, radio stations) use opaque IDs consistently
- [ ] Verify search results return opaque IDs
- [ ] Verify library (saved albums, bookmarks) uses opaque IDs
- [ ] Verify queue items contain opaque track IDs

---

### C. API Surface Compliance

Compare each router's actual procedures against the spec in `phase2-opaque-ids-api-reshape.md`:

**C1. `auth` Router** (`server/routers/auth.ts`)
- [ ] Has: `login`, `logout`, `status`
- [ ] Spec also calls for: `settings`, `usage`, `changeSettings` (migrated from old `user` router)
- [ ] Verify login returns session cookie
- [ ] Verify login is not hardcoded to Pandora only (Phase 4 requirement)

**C2. `track` Router** (`server/routers/track.ts`)
- [ ] Has: `get`, `streamUrl`
- [ ] Spec calls for: `feedback`, `removeFeedback`, `sleep`, `explain`
- [ ] Verify all inputs accept opaque IDs
- [ ] Verify streamUrl returns an opaque-ID-based `/stream/` URL

**C3. `album` Router** (`server/routers/album.ts`)
- [ ] Has: `get`, `tracks`
- [ ] Verify tracks response includes opaque track IDs

**C4. `artist` Router** (`server/routers/artist.ts`)
- [ ] Exists (even if stub)
- [ ] Spec calls for: `get`, `search`

**C5. `radio` Router** (`server/routers/radio.ts`)
- [ ] Has: `list`, `getTracks`, `create`, `delete`, `rename`
- [ ] Spec also calls for: `genres`, `quickMix`, `addSeed`, `removeSeed`
- [ ] Verify `getTracks` wraps Pandora's getPlaylist and returns opaque track IDs
- [ ] Verify `list` returns opaque radio station IDs

**C6. `playlist` Router** (`server/routers/playlist.ts`)
- [ ] Has: `list`, `getTracks`
- [ ] Verify returns opaque IDs

**C7. `library` Router** (`server/routers/library.ts`)
- [ ] Has: `albums`, `albumTracks`, `saveAlbum`, `removeAlbum`
- [ ] Spec also calls for: `bookmarks`, `addBookmark`, `removeBookmark`
- [ ] Verify bookmarks functionality migrated from old bookmarks router

**C8. `search` Router** (`server/routers/search.ts`)
- [ ] Has: `unified`
- [ ] Verify returns tracks + albums + artists with opaque IDs
- [ ] Verify old Pandora-only `search` procedure removed or folded into `unified`

**C9. `player` Router** (`server/routers/player.ts`)
- [ ] Phase 3 spec: `state`, `play`, `pause`, `resume`, `skip`, `previous`, `seek`, `volume`
- [ ] Has tRPC subscription: `onStateChange`
- [ ] Verify subscription emits: `{ state, track, progress, duration }`

**C10. `queue` Router** (`server/routers/queue.ts`)
- [ ] Phase 3 spec: `get`, `add`, `remove`, `jump`, `clear`, `shuffle`
- [ ] Has tRPC subscription: `onChange`
- [ ] Verify subscription emits: `{ items, currentIndex }`

**C11. `credentials` Router** (`server/routers/credentials.ts`)
- [ ] Phase 4 spec: `list`, `add`, `remove`, `test`
- [ ] Verify source-agnostic (not hardcoded to Pandora)

---

### D. Server-Authoritative Playback (Phase 3)

**D1. Player Service**
- [ ] Verify `server/services/player.ts` exists
- [ ] Verify it owns state: status (playing/paused/stopped), currentTrack, progress, duration
- [ ] Verify progress tracking uses monotonic clock (not browser-reported)
- [ ] Verify state persisted to DB (survives server restart)
- [ ] Verify it emits events that tRPC subscriptions consume

**D2. Queue Service**
- [ ] Verify `server/services/queue.ts` exists
- [ ] Verify it maintains ordered track list with currentIndex
- [ ] Verify queue persisted to DB via `queue_items` table
- [ ] Verify queue context tracked (radio/album/playlist/manual)
- [ ] Verify auto-fetch of new tracks in radio mode

**D3. Database Schema**
- [ ] Verify `src/db/schema.ts` has tables: `queueItems`, `playerState`, `queueContext`
- [ ] Verify migration runs without errors on fresh DB
- [ ] Verify schema matches spec (column names, types, defaults)

**D4. WebSocket Removal**
- [ ] Verify `server/handlers/websocket.ts` deleted or unused
- [ ] Verify `src/web/hooks/useWebSocket.ts` deleted or unused
- [ ] Verify `server/services/playback.ts` (old WS-based) deleted or folded into player service
- [ ] Verify `server/index.ts` no longer handles WebSocket upgrade

**D5. Frontend Subscription Client**
- [ ] Verify `usePlayback` hook subscribes to `player.onStateChange`
- [ ] Verify it subscribes to `queue.onChange`
- [ ] Verify Audio element loads URL from server state (not locally derived)
- [ ] Verify transport commands (`play`, `pause`, `skip`, `seek`) are tRPC mutations, not local state changes
- [ ] Verify auto-resume on client connect (opening app shows current playback state)

**D6. Cross-Device Transfer**
- [ ] Verify opening a second browser tab shows the same playback state
- [ ] Verify pause in one tab reflects in the other

---

### E. Credential Management (Phase 4 — Uncommitted)

**E1. Database**
- [ ] Verify `source_credentials` table in `src/db/schema.ts`
- [ ] Schema: `id`, `source`, `username`, `password`, `session_data`, `created_at`, `updated_at`

**E2. Credential Service**
- [ ] Verify `server/services/credentials.ts` exists
- [ ] Manages per-source credentials in DB
- [ ] Can test credentials (validate without full session)
- [ ] Provides active Pandora session from stored credentials

**E3. Context Generalization**
- [ ] Verify `server/trpc.ts` context is not strictly Pandora-coupled
- [ ] Verify `protectedProcedure` works without Pandora session (YTMusic-only scenario)
- [ ] Verify `pandoraProtectedProcedure` exists for Pandora-specific endpoints
- [ ] Verify `sourceManager` is in context

**E4. Session Service**
- [ ] Verify `server/services/session.ts` is source-agnostic
- [ ] Verify auto-login from stored credentials works (`server/services/autoLogin.ts`)

**E5. Frontend**
- [ ] Verify settings page allows managing source credentials
- [ ] Verify login page works with the new credential system
- [ ] Verify app works when only YTMusic credentials exist (no Pandora)

---

### F. Build & Type Safety

- [ ] Run `bun run typecheck` — must pass with zero errors
- [ ] Run `bun test` — all tests pass
- [ ] Run `bun run build:web` — produces valid build
- [ ] Check for `any` type usage in new/modified files — flag occurrences
- [ ] Check for `as` type assertions in new/modified files — flag unnecessary casts
- [ ] Verify no `// @ts-ignore` or `// @ts-expect-error` added

---

### G. Regression Checks

Test these user flows work end-to-end:

- [ ] Login with Pandora credentials
- [ ] Browse Pandora radio stations
- [ ] Play a Pandora radio station (audio plays)
- [ ] Skip, pause, resume on Pandora station
- [ ] Thumbs up / thumbs down on a track
- [ ] Search for music (unified search returns results)
- [ ] Play a YTMusic playlist
- [ ] Save an album to library
- [ ] View library (saved albums appear)
- [ ] Play an album from library
- [ ] View bookmarks
- [ ] Create station from search result
- [ ] Now-playing page shows correct track info and artwork

---

## Reporting Format

For each finding, report:

```
### [SEVERITY] Finding Title
- **Location**: file:line
- **Category**: Bug | Spec Deviation | Missing Feature | Regression | Type Safety | Code Quality
- **Description**: What's wrong
- **Expected**: What the spec says
- **Actual**: What the code does
- **Impact**: How this affects the user/system
```

Severity levels:
- **CRITICAL**: App broken, data loss, security issue
- **HIGH**: Feature doesn't work as specified
- **MEDIUM**: Spec deviation that doesn't block usage
- **LOW**: Code quality, missing stubs, minor inconsistencies

---

## Acceptance Criteria for Review Completion

- [ ] Every section (A through G) has been checked
- [ ] All findings documented with severity, location, and description
- [ ] Summary count: N critical, N high, N medium, N low
- [ ] Recommendation: ship as-is, fix critical/high first, or rework needed
