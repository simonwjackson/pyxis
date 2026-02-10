# Rename Library Album & Track Metadata

**Date:** 2026-02-10
**Status:** Ready for planning

## What We're Building

Allow users to rename album titles, album artists, track titles, and track artists for saved library items. Triggered by long-pressing the text on the album detail page, which turns it into an inline editable field. Saves on blur or Enter.

Currently, library metadata is frozen at save time with no way to correct errors, fix capitalization, or personalize names.

## Why This Approach

**Inline edit on long press (Approach 1):** Long press a specific title or artist text to make it editable in-place. Simple, direct, mobile-friendly.

Chosen over:
- **Edit mode toggle** — Over-engineered for renaming individual fields. Batch editing adds state management complexity for little benefit.
- **Edit dialog** — Too much friction for a simple text rename. Modal interrupts the browsing flow.

## Key Decisions

1. **Long press to edit** — Tap the text, it becomes an input. Enter or blur saves. Escape cancels.
2. **Both album and track metadata** — Album title/artist in the header, individual track title/artist in the track list.
3. **No reset to original** — Edits overwrite the stored value. Keep it simple.
4. **Saves immediately** — Each field saves independently on blur/Enter via a tRPC mutation. No batch save needed.
5. **Library items only** — Source-backed (unsaved) albums are read-only. You can only rename what's in your library.

## Scope

### Backend
- `updateAlbum` mutation — Update album title and/or artist by nanoid.
- `updateTrack` mutation — Update track title and/or artist by nanoid.

### Frontend
- Long-press gesture on album title, album artist, track title, track artist in `album-detail-page.tsx`.
- Inline text input replaces the text on long press.
- Visual cue that fields are editable (e.g., subtle underline on long press, or brief highlight).
- Framer Motion is already available for gesture handling.

## Open Questions

None — ready for planning.
