# Browse Album from Search Without Saving

**Date:** 2026-02-10
**Status:** Ready for planning

## What We're Building

Two interactions for albums in search results:

1. **Click album artwork** → Fetch tracks from source, start playing immediately. Stay on the search page.
2. **Click album title/name** → Navigate to the album detail page showing full track list, play/shuffle controls, and a "Save to Library" button — all without saving first.

Currently, search results show albums with only a "Save" button. The album detail page (`/album/$albumId`) only loads from the local database, so albums must be saved before they can be browsed or played. This creates unnecessary friction.

## Why This Approach

**Unified album route:** Extend the existing `/album/$albumId` route to handle both saved albums (local UUIDs from DB) and unsaved albums (source-prefixed IDs like `ytmusic:abc123` fetched on-the-fly).

Chosen over:
- **Separate route** — Would duplicate nearly identical UI for a minor data-source difference.
- **Shared UI + data hook abstraction** — Over-engineered for what amounts to two `useQuery` calls behind an ID format check.

The ID format already distinguishes saved vs. unsaved: local UUIDs for saved, `source:id` for unsaved. The playback system already handles source-prefixed track IDs natively.

## Key Decisions

1. **Two click targets on album search results** — Artwork = instant play, title = navigate to detail.
2. **Single route for both saved and unsaved albums** — `/album/$albumId` detects ID format and fetches from DB or source accordingly.
3. **Same album detail layout** — Unsaved albums get the same page as saved ones (artwork, track list, play/shuffle).
4. **Save button on unsaved album pages** — Users can optionally save to library after previewing.
5. **On-the-fly source fetch** — New tRPC endpoint to fetch album + tracks directly from a source without persisting.

## Scope

### Backend
- New tRPC endpoint (e.g., `album.getFromSource`) that takes a source-prefixed album ID, calls `sourceManager.getAlbumTracks()`, and returns canonical album + tracks without saving to DB.

### Frontend — Search Results
- Album artwork becomes clickable: fetch tracks via new endpoint, call `player.play` mutation to start playback immediately.
- Album title/name becomes a link to `/album/$sourceAlbumId`.

### Frontend — Album Detail Page
- Detect ID format (source-prefixed vs. local UUID).
- Source-prefixed: fetch from new tRPC endpoint instead of local DB.
- Show "Save to Library" button for unsaved albums.
- Playback works unchanged — `player.play` already accepts arbitrary tracks.

## Open Questions

None — ready for planning.
