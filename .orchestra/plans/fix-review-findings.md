# Fix v2 Review Findings (All Critical/High/Medium)

Addresses all findings from `history/review-v2-architecture.md`.

---

## Design Decision: Capabilities Endpoint

The frontend currently uses `source` to decide which UI features to show (thumbs up/down, bookmark, sleep, create radio). Instead of leaking source identity, the server will attach **capability flags** to entity responses. The frontend checks capabilities, not source names.

### Capability Shape

```typescript
type TrackCapabilities = {
  readonly feedback: boolean;   // thumbs up/down (Pandora only)
  readonly sleep: boolean;      // sleep track (Pandora only)
  readonly bookmark: boolean;   // bookmark track/artist (Pandora only)
  readonly explain: boolean;    // music genome info (Pandora only)
  readonly radio: boolean;      // create radio from track (both sources)
};

type AlbumCapabilities = {
  readonly radio: boolean;      // create radio from album
};

type PlaylistCapabilities = {
  readonly radio: boolean;      // create radio from playlist
};
```

The server derives these from `decodeId(opaqueId).source` internally — the client never sees the source string.

---

## Step 1: Add `@types/bun` to devDependencies

**Finding**: F2 — TypeScript errors (HIGH)
**Files**: `package.json`

Add `"@types/bun": "^1.x"` to devDependencies. Run `bun install`. Verify `bun run typecheck` passes.

---

## Step 2: Add capability helper to `server/lib/ids.ts`

**Files**: `server/lib/ids.ts`

Add a `capabilitiesForSource` function that maps source → capability flags:

```typescript
export function trackCapabilities(source: SourceType): TrackCapabilities {
  const isPandora = source === "pandora";
  return {
    feedback: isPandora,
    sleep: isPandora,
    bookmark: isPandora,
    explain: isPandora,
    radio: true, // both pandora and ytmusic support radio creation
  };
}
```

---

## Step 3: Remove `source` from all router responses, add `capabilities`

**Finding**: B2 — Source field leakage (CRITICAL)

### `server/routers/search.ts`
- Line 18: Remove `source: track.sourceId.source`
- Line 34: Remove `source: sid.source` from album sourceIds
- Add `capabilities: trackCapabilities(track.sourceId.source)` to `encodeTrack`
- Change album `sourceIds` array to just `ids` array (opaque IDs only, no source)

### `server/routers/playlist.ts`
- Line 21: Remove `source: track.sourceId.source` from `encodeTrack`
- Line 29: Remove `source: playlist.source` from `encodePlaylist`
- Add `capabilities` to track encoding

### `server/routers/radio.ts`
- Line 18: Remove `source: "pandora" as const` from `encodePlaylistItem`
- Add `capabilities: trackCapabilities("pandora")` instead

### `server/routers/track.ts`
- Line 12: Change return from `{ source, id, opaqueId: input.id }` to `{ id: input.id, capabilities: trackCapabilities(source) }` — remove raw `source` and `id`

### `server/routers/library.ts`
- Lines 24-27: Remove `sourceRefs` with raw `source` and `sourceId`. Replace with opaque `ids` array:
  ```typescript
  sourceIds: refs.map((ref) => encodeId(ref.source as SourceType, ref.sourceId)),
  ```
- Line 44: `albumTracks` response — also add capabilities per track, strip `source` and `sourceTrackId` from response (they're currently spread via `...t`)

---

## Step 4: Remove `source` from queue/player input schemas

**Finding**: B3 — Client sends source (CRITICAL)

### `server/routers/queue.ts`
- Line 38: Remove `source: z.enum(...)` from track input schema
- In handler: derive source via `decodeId(track.id).source` for each track before passing to queue service

### `server/routers/player.ts`
- Line 48: Remove `source: z.enum(...)` from track input schema
- In handler: derive source via `decodeId(track.id).source` for each track

### `server/services/queue.ts`
- `QueueTrack` type (line 10): Keep `source: SourceType` internal — it's set by the router from `decodeId`, not from client input

---

## Step 5: Update frontend to use capabilities instead of source

### `src/web/components/search/SearchResults.tsx`
- Remove `source` from `SearchTrack` type (line 21)
- Remove `source` from `SearchAlbum.sourceIds` type (line 34)
- Add `capabilities: { radio: boolean }` to both types
- Line 109: Remove source label display from album metadata
- Line 159: Remove source label display from track metadata
- Line 163: Change `track.source === "pandora"` → `track.capabilities.radio`
- Line 174: Change `track.source === "ytmusic"` → `track.capabilities.radio`
- Merge the two conditional radio buttons into one (both show same action now)

### `src/web/routes/home.tsx`
- Remove `source` from `PlaylistData` type (line 11)
- Remove `sourceLabel`, `sourceGradient`, `sourceLabelColor` utility functions (lines 15-46)
- Lines 62, 72, 85: Remove source-specific styling and labels from playlist cards. Use a uniform style.

### `src/web/routes/now-playing.tsx`
- Remove `source` from `NowPlayingTrack` type (line 37)
- Add `capabilities` to `NowPlayingTrack`: `{ feedback: boolean; sleep: boolean; bookmark: boolean; explain: boolean }`
- Replace all `isPandora` checks with capability checks:
  - `isPandora` → `currentTrack?.capabilities.feedback` for thumbs up/down
  - `isPandora` → `currentTrack?.capabilities.bookmark` for bookmark button
  - `isPandora` → `currentTrack?.capabilities.sleep` for sleep button
  - `isPandora` → `currentTrack?.capabilities.explain` for track info
- Line 120: Remove `source: t.source` from queue payload (source no longer sent from client)
- Update `radioTrackToNowPlaying`, `playlistTrackToNowPlaying`, and album track mapping to derive capabilities from response data instead of source

### `src/web/routes/search.tsx`
- Remove `source` from `SearchTrack` type (line 11)
- Add capabilities type instead

### `src/web/routes/settings.tsx`
- **No change needed** — source usage here is for credential management (legitimate)

---

## Step 6: Switch to Base64URL encoding

**Finding**: B1 — Standard base64 URL safety (MEDIUM)

### `server/lib/ids.ts`
- Replace `btoa`/`atob` with base64url encoding:
  ```typescript
  function toBase64Url(str: string): string {
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function fromBase64Url(str: string): string {
    const padded = str.replace(/-/g, "+").replace(/_/g, "/");
    return atob(padded);
  }
  ```
- Remove `encodeURIComponent` from `buildStreamUrl` (no longer needed)

### `server/index.ts`
- Line 33-35: Update stream endpoint to handle base64url IDs (remove `decodeURIComponent` since base64url is URL-safe)
- Add backwards-compatibility: try base64url first, fall back to standard base64 for any existing stored IDs

---

## Step 7: Add `queue.jump` procedure

**Finding**: C10 — Missing `jump` in queue router (MEDIUM)

### `server/routers/queue.ts`
- Add `jump` mutation that calls `QueueService.jumpTo(index)` (method already exists on queue service)
- Keep `player.jumpTo` as well (it does jump + play) — they serve different purposes

---

## Step 8: Fix artist router stubs

**Finding**: C4 — Artist router is empty (MEDIUM)

### `server/routers/artist.ts`
- `get`: Decode opaque ID, call SourceManager to fetch artist info. Return whatever the source provides (may still be limited).
- `search`: Call SourceManager unified search, filter to artist results, return with opaque IDs.

This depends on whether SourceManager has artist lookup. If not, leave as stub but add a clear error message instead of empty data.

---

## Step 9: Fix login flow for non-Pandora users

**Finding**: E5 — Login page Pandora-only (MEDIUM)

### `src/web/routes/login.tsx`
- Add a "Skip login" or "Continue without Pandora" option that:
  1. Creates a Pyxis session without Pandora auth
  2. Redirects to settings page where YTMusic credentials can be added
- Alternatively, add a source selector dropdown (Pandora / YTMusic / Skip)

### `server/routers/auth.ts`
- Add handling for session creation without Pandora credentials

---

## Step 10: Fix swallowed error

**Finding**: F4 — Swallowed play error (LOW)

### `src/web/hooks/usePlayback.ts`
- Line 207: Change `audio.play().catch(() => {})` to `audio.play().catch((err) => console.error("[usePlayback] play() rejected:", err))`

---

## Verification

After all steps:
- [ ] `bun run typecheck` — 0 errors
- [ ] `bun test` — all pass
- [ ] `bun run build:web` — succeeds
- [ ] Grep `server/routers/` for `source:` in response objects — 0 matches
- [ ] Grep `src/web/` for `.source` on track/album/playlist objects — 0 matches (except settings.tsx credentials)
- [ ] Grep `queue.add`/`player.play` input schemas for `source:` — 0 matches
