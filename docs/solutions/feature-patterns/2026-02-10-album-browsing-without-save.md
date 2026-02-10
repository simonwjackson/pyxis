---
title: "Browse and play albums from search without saving"
date: "2026-02-10"
category: "feature-patterns"
tags:
  - album-browsing
  - search-integration
  - playback
  - source-prefixed-ids
  - conditional-hooks
  - combined-endpoints
components:
  - server/routers/album.ts
  - src/web/features/album-detail/album-detail-page.tsx
  - src/web/features/search/search-results.tsx
  - src/web/features/search/search-page.tsx
  - src/web/shared/lib/now-playing-utils.ts
problem_type: user-workflow-friction
severity: medium
---

# Browse and Play Albums from Search Without Saving

## Problem

Users had to save an album to their library before they could see its track list or play it. The search page only showed a "Save" button on albums with no way to preview or play. This created friction in music discovery.

**Root cause:** The album detail page hardcoded data fetching to `trpc.library.albums` and `trpc.library.albumTracks`, which only query the local database. Source-prefixed IDs from search (e.g., `ytmusic:OLAK5uy_abc`) had no matching library entries, so the page showed "Album not found."

## Solution

### 1. Combined Backend Endpoint (`server/routers/album.ts`)

Added `getWithTracks` that returns album metadata + tracks in a single upstream call:

```typescript
getWithTracks: publicProcedure
  .input(z.object({ id: z.string() }))
  .query(async ({ input }) => {
    const parsed = parseId(input.id);
    const sourceManager = await ensureSourceManager();
    const { album, tracks } = await sourceManager.getAlbumTracks(parsed.source, parsed.id);
    return {
      album: { id: input.id, title: album.title, artist: album.artist, ... },
      tracks: tracks.map((t, index) => ({
        ...encodeTrack(t),
        trackIndex: index,
        capabilities: trackCapabilities(t.sourceId.source),
      })),
    };
  }),
```

**Why combined:** The existing `album.get` and `album.tracks` each call `sourceManager.getAlbumTracks()` independently, doubling upstream requests. For YouTube Music, this means spawning yt-dlp twice.

### 2. Album Detail Page Branching (`album-detail-page.tsx`)

Detects ID format and conditionally fetches from the appropriate source:

```typescript
const isSourceBacked = albumId.includes(":");

// Both hooks always called, but only one enabled at a time
const libraryAlbumsQuery = trpc.library.albums.useQuery(undefined, {
  enabled: !isSourceBacked,
});
const sourceQuery = trpc.album.getWithTracks.useQuery(
  { id: albumId },
  { enabled: isSourceBacked },
);

// Normalize to common shape
const album = isSourceBacked
  ? sourceQuery.data?.album
  : libraryAlbumsQuery.data?.find((a) => a.id === albumId);
```

Added "Save to Library" button visible only for source-backed albums, error/retry state, and `router.history.back()` navigation.

### 3. Search Results Split Click Targets (`search-results.tsx`)

Album rows now have two interactive zones:
- **Artwork**: Click triggers immediate play with spinner overlay during fetch
- **Title**: `<Link>` navigates to album detail page

### 4. Imperative Fetch for Instant Play (`search-page.tsx`)

Artwork click uses `trpc.useUtils()` for programmatic fetch outside the render cycle:

```typescript
const handlePlayAlbum = useCallback(async (albumId: string) => {
  if (playingAlbumId) return; // Prevent concurrent fetches
  setPlayingAlbumId(albumId);
  try {
    const data = await utils.album.getWithTracks.fetch({ id: albumId });
    const ordered = data.tracks.map((t) =>
      sourceAlbumTrackToNowPlaying(t, data.album.title, data.album.artworkUrl ?? null),
    );
    playbackRef.current.playMutation.mutate({
      tracks: tracksToQueuePayload(ordered),
      context: { type: "album", albumId },
      startIndex: 0,
    });
  } catch {
    toast.error("Failed to load album");
  } finally {
    setPlayingAlbumId(null);
  }
}, [playingAlbumId, utils.album.getWithTracks]);
```

### 5. Track Shape Converter (`now-playing-utils.ts`)

Added `SourceAlbumTrack` type and `sourceAlbumTrackToNowPlaying()` to handle the different data shape from source-backed tracks vs library tracks.

## Key Patterns

### ID Format Detection

`albumId.includes(':')` distinguishes source-prefixed IDs (`ytmusic:abc`) from library nanoid IDs (`a3kF9x2abc`). This mirrors `parseId()` in `server/lib/ids.ts`.

### Conditional React Query Hooks

Both library and source queries are always called (hooks rules) but with mutually exclusive `enabled` flags. This avoids conditional hook violations while ensuring only the relevant data path runs.

### Combined Endpoints Avoid Double Upstream Calls

When the underlying source manager method returns both album and tracks, expose a single endpoint rather than forcing the client to make two calls.

## Prevention & Gotchas

1. **Don't hardcode `includes(':')` everywhere.** Consider a centralized `isSourceId(id)` helper if this pattern spreads.

2. **Always include `capabilities` in track responses.** New endpoints that return tracks must include `trackCapabilities(source)` or the UI won't know which actions to show.

3. **Don't mix `useQuery` + `.fetch()` for the same endpoint and ID.** Use queries for render-driven data, imperative fetch for event handlers. Mixing causes stale cache issues.

4. **Create a new converter for each distinct track shape.** Don't force different types through one function with `as any`. Library tracks use `albumTrackToNowPlaying`, source tracks use `sourceAlbumTrackToNowPlaying`.

5. **The `getWithTracks` endpoint only works with source-prefixed IDs.** Library albums use separate `library.albums` + `library.albumTracks` queries that hit the local DB directly.

6. **Test both flows when modifying the album detail page.** It handles library and source albums through the same component with branching logic.

## Related Documentation

- Brainstorm: `docs/brainstorms/2026-02-10-browse-album-from-search-brainstorm.md`
- Plan: `docs/plans/2026-02-10-feat-browse-play-album-from-search-plan.md`
- ID system: `server/lib/ids.ts` (`parseId`, `formatSourceId`, `trackCapabilities`)
- Architecture reviews: `history/v2-architecture-review-r3.md` (opaque ID system validation)
- Source abstraction: `ARCHITECTURE.md` (capability interfaces, source manager)
