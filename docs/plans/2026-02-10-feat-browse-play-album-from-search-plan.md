---
title: "feat: Browse and play albums from search without saving"
type: feat
date: 2026-02-10
brainstorm: docs/brainstorms/2026-02-10-browse-album-from-search-brainstorm.md
---

# Browse and Play Albums from Search Without Saving

## Overview

Add two interactions for albums in search results:

1. **Click album artwork** — Fetch tracks from source, start playing immediately, stay on search page.
2. **Click album title** — Navigate to `/album/$albumId` showing full track list, play/shuffle, and "Save to Library" button — fetched on-the-fly from the source without saving.

The existing album detail page only works with saved library albums (nanoid IDs). This extends it to also handle source-prefixed IDs (e.g., `ytmusic:OLAK5uy_abc`) by branching data fetching based on the ID format.

## Problem Statement

Users must save an album to their library before they can see its track list or play it. This adds friction to music discovery — you have to commit before you can preview.

## Technical Approach

### Key Insight: Backend Already Supports This

`server/routers/album.ts` already has two endpoints that accept source-prefixed IDs:
- `album.get` (line 38) — Returns album metadata from source
- `album.tracks` (line 58) — Returns tracks from source

Both call `sourceManager.getAlbumTracks()` independently, which means **two upstream requests for one album view**. This needs consolidation.

### ID Detection Strategy

Client-side check: `albumId.includes(':')` distinguishes source-prefixed IDs from nanoid library IDs. This mirrors the server-side `parseId()` logic in `server/lib/ids.ts:102`.

### Data Shape Normalization

Source-backed tracks (`album.tracks`) and library tracks (`library.albumTracks`) return different shapes:

| Field | Library Track | Source Track |
|-------|--------------|--------------|
| `id` | nanoid | source-prefixed (`ytmusic:abc`) |
| `trackIndex` | from DB | **missing** (derive from array index) |
| `capabilities` | from `trackCapabilities()` | **missing** (needs adding) |
| `duration` | number (seconds) | number or undefined |

The album detail page currently uses `albumTrackToNowPlaying()` from `src/web/shared/lib/now-playing-utils.ts:119` which expects the library shape. Source tracks need a parallel converter or the endpoint needs to include the missing fields.

## Implementation Phases

### Phase 1: Backend — Combined Album+Tracks Endpoint

**File:** `server/routers/album.ts`

Add a `getWithTracks` endpoint that returns both album metadata and tracks in one call, avoiding the double upstream request:

```typescript
// server/routers/album.ts
getWithTracks: publicProcedure
  .input(z.object({ id: z.string() }))
  .query(async ({ input }) => {
    const parsed = parseId(input.id);
    if (!parsed.source) {
      throw new Error(`Requires source-prefixed ID`);
    }
    const sourceManager = await ensureSourceManager();
    const { album, tracks } = await sourceManager.getAlbumTracks(
      parsed.source, parsed.id
    );
    return {
      album: {
        id: input.id,
        title: album.title,
        artist: album.artist,
        year: album.year ?? null,
        artworkUrl: album.artworkUrl ?? null,
      },
      tracks: tracks.map((t, index) => ({
        ...encodeTrack(t),
        trackIndex: index,
        capabilities: trackCapabilities(t.sourceId.source),
      })),
    };
  }),
```

**Why combined:** Both `album.get` and `album.tracks` call `sourceManager.getAlbumTracks()` separately. For YouTube Music, this means running yt-dlp twice. A combined endpoint halves latency and upstream load.

Also ensure `encodeTrack` in `album.ts` includes `capabilities` — currently it doesn't (compare with `library.ts:66` which does).

### Phase 2: Frontend — Album Detail Page Branching

**File:** `src/web/features/album-detail/album-detail-page.tsx`

Modify the album detail page to handle both ID types:

1. **Detect ID format** — `const isSourceBacked = albumId.includes(':');`

2. **Conditional data fetching:**
   - Source-backed: `trpc.album.getWithTracks.useQuery({ id: albumId })`
   - Library: existing `trpc.library.albums.useQuery()` + `trpc.library.albumTracks.useQuery({ albumId })`

3. **Normalize to common shape** for rendering and playback:

```typescript
// Derive album + tracks from whichever source
const { album, tracks, isLoading, isSaved } = isSourceBacked
  ? useSourceAlbumData(albumId)
  : useLibraryAlbumData(albumId);
```

4. **Add "Save to Library" button** — Visible when `isSourceBacked && !isSaved`. Uses existing `library.saveAlbum` mutation. After save: button changes to disabled "Saved" state, stays on current URL.

5. **Track conversion for source-backed albums** — Create `sourceTrackToNowPlaying()` parallel to existing `albumTrackToNowPlaying()`:

```typescript
// src/web/shared/lib/now-playing-utils.ts
export function sourceTrackToNowPlaying(
  track: SourceTrackRow,
  index: number,
  albumName: string,
  albumArtUrl: string | null,
): NowPlayingTrack {
  return {
    id: track.id,  // source-prefixed, works with stream proxy
    songName: track.title,
    artistName: track.artist,
    albumName,
    albumArtUrl: track.artworkUrl ?? albumArtUrl ?? undefined,
    capabilities: track.capabilities,
    duration: track.duration ?? undefined,
  };
}
```

### Phase 3: Frontend — Search Results Click Targets

**File:** `src/web/features/search/search-results.tsx`

Split the album row into two click zones:

1. **Album artwork** — Clickable, triggers instant play:
   - On click: fetch `album.getWithTracks`, convert tracks to queue payload, call `playMutation.mutate()`
   - Show spinner overlay on artwork during fetch
   - Track "currently fetching" album ID in local state to prevent concurrent fetches

2. **Album title** — `<Link to="/album/$albumId">` navigating to album detail page

**File:** `src/web/features/search/search-page.tsx`

- Add `trpc.album.getWithTracks.useMutation()` (or lazy query) for the artwork click-to-play flow
- Wire up playback via `usePlayback` ref (same pattern as radio creation at line 163)

### Phase 4: Polish

1. **Back navigation** — `album-detail-page.tsx:136` hardcodes back to `/`. Change to `navigate(-1)` or `router.history.back()` so users return to search.

2. **Loading states:**
   - Album detail page: show skeleton while `getWithTracks` resolves
   - Search artwork click: spinner overlay on the clicked artwork

3. **Error states:**
   - Album detail source fetch failure: "Couldn't load album. Retry?" with retry button (React Query handles retries automatically, but show the error state)
   - Artwork play failure: toast with error message

## Gate Check: URL Param Colon Handling

**Before any frontend work**, verify that TanStack Router passes colons through `$albumId` intact. Source-prefixed IDs like `ytmusic:OLAK5uy_abc` contain colons.

Test: navigate to `/album/ytmusic:test` and check `Route.useParams().albumId === 'ytmusic:test'`.

If colons are stripped or split, alternatives:
- URL-encode the colon (`ytmusic%3AOLAK5uy_abc`) in links, decode in route
- Use a different delimiter in URLs only (e.g., `ytmusic--OLAK5uy_abc`)

This is a go/no-go gate for the URL scheme.

## Acceptance Criteria

- [x] Clicking album artwork in search results plays the album immediately (no navigation)
- [x] Clicking album title in search results navigates to album detail page
- [x] Album detail page shows track list, play/shuffle for source-backed albums
- [x] "Save to Library" button appears on source-backed album detail pages
- [x] Saving transitions button to "Saved" state, shows toast
- [x] Already-saved albums show appropriate feedback when save is attempted
- [x] Back button from album detail returns to search (not always home)
- [x] Existing library album detail pages continue to work unchanged

## Files to Modify

| File | Change |
|------|--------|
| `server/routers/album.ts` | Add `getWithTracks` endpoint with capabilities + trackIndex |
| `src/web/features/album-detail/album-detail-page.tsx` | Branch data fetching, add save button |
| `src/web/features/search/search-results.tsx` | Split click targets: artwork (play) and title (navigate) |
| `src/web/features/search/search-page.tsx` | Wire artwork click-to-play |
| `src/web/shared/lib/now-playing-utils.ts` | Add `sourceTrackToNowPlaying` converter |

## Out of Scope

- Cross-referencing search results against library to show "already saved" indicator (separate enhancement)
- Caching source album data between searches
- Deep-link sharing of source-backed album URLs

## References

- Brainstorm: `docs/brainstorms/2026-02-10-browse-album-from-search-brainstorm.md`
- Existing album router: `server/routers/album.ts:38-69`
- Album detail page: `src/web/features/album-detail/album-detail-page.tsx:66-94`
- Search results: `src/web/features/search/search-results.tsx:75-158`
- ID parsing: `server/lib/ids.ts:102-115`
- Track conversion: `src/web/shared/lib/now-playing-utils.ts:119-151`
