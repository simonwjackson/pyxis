---
title: "feat: Inline Rename Library Album and Track Metadata"
type: feat
date: 2026-02-10
---

# Inline Rename Library Album and Track Metadata

## Overview

Add inline editing for album titles, album artists, and track titles on the album detail page. Users long-press (500ms) any text field to transform it into an editable input. Changes save immediately on Enter/blur, cancel on Escape. Only library albums (nanoid IDs) are editable — source-backed albums remain read-only.

Track artist editing is deferred to a follow-up (track artist is not currently rendered in the UI).

## Problem Statement / Motivation

Library metadata is frozen at save time. Album titles come from upstream sources with inconsistent capitalization, typos, or formatting the user disagrees with. There is currently no way to correct `"the beatles"` to `"The Beatles"` or fix a misspelled track name without deleting and re-adding the album.

## Proposed Solution

### Backend — Two tRPC mutations in `server/routers/library.ts`

**`library.updateAlbum`**
- Input: `{ id: string, title?: string, artist?: string }` — at least one field required
- Validates: non-empty after trim, `id` must exist
- Uses Drizzle `update().set().where()` pattern (proven in `server/scripts/enrich-library.ts:296`)
- Returns `{ success: true }`

**`library.updateTrack`**
- Input: `{ id: string, title: string }`
- Same validation and pattern as above
- Returns `{ success: true }`

Both use `publicProcedure` (matches `saveAlbum`/`removeAlbum` pattern — no auth for single-user library ops).

### Frontend — `EditableText` component + album detail integration

**New component: `src/web/shared/ui/editable-text.tsx`**

A reusable inline-edit primitive that:
1. Renders children (text) by default
2. On long-press (500ms via Framer Motion `onPointerDown`), transforms into an `<input>`
3. Pre-fills with current value, auto-selects text
4. Saves on Enter or blur (calls `onSave` prop)
5. Cancels on Escape (reverts to original)
6. Skips save if value is unchanged (no-op guard)
7. Rejects empty/whitespace-only values (reverts + no save)
8. Can be disabled (for source-backed albums)

**Integration in `src/web/features/album-detail/album-detail-page.tsx`**

Wrap three text elements with `EditableText`:
- Album title (`<h1>`, line 253) → `onSave` calls `updateAlbum({ id, title })`
- Album artist (`<p>`, line 256) → `onSave` calls `updateAlbum({ id, artist })`
- Track title (`<span>`, line 324) → `onSave` calls `updateTrack({ id, title })`

Gated by `!isSourceBacked` — source-backed albums pass `disabled` to `EditableText`.

## Technical Considerations

### Gesture Discrimination (Long-Press vs. Tap-to-Play)

Track rows are `<button>` elements with `onClick` handlers that start playback. A long-press on the track title must NOT also trigger playback. Solution:

- Track a `longPressTriggered` ref in `EditableText`
- On pointer down: start a 500ms timer
- If timer fires: set `longPressTriggered = true`, enter edit mode
- On pointer up: if `longPressTriggered`, call `e.stopPropagation()` to suppress the parent's `onClick`
- Reset the flag after the click event passes

This is the standard pattern for discriminating tap vs. long-press on interactive elements.

### Native Context Menu Suppression

On mobile, long-press triggers the browser's native context menu (copy/paste). Suppress with `onContextMenu={(e) => e.preventDefault()}` on the `EditableText` wrapper, only when the component is enabled.

### Cache Invalidation

On mutation success:
- `updateAlbum` → invalidate `library.albums` (home page cards) and `library.albumTracks` (detail page)
- `updateTrack` → invalidate `library.albumTracks`

Follow the existing pattern from `saveAlbum` (album-detail-page.tsx:114).

### Optimistic Updates

Use optimistic UI: immediately display the new text on save, revert on error. This avoids the flicker of input → old text → new text that occurs when waiting for server + cache refresh.

Pattern: in `onSave`, set local state to the new value immediately, fire the mutation, and only revert in `onError`.

### Stale Now-Playing Data

The queue stores independent copies of metadata. Renaming a library album does NOT update the queue. If the renamed track is currently playing, the now-playing bar shows the old name until next playback. This is an acceptable trade-off — updating the queue adds significant complexity for minimal benefit in a single-user app.

### Keyboard Shortcut Safety

The global shortcut system (`src/web/shared/lib/shortcuts.ts:57-62`) already guards against firing shortcuts when `<input>` elements are focused. The `isInputElement()` check covers dynamically created inputs, so Space (play/pause) and other shortcuts will not conflict with typing in the edit field.

### Framer Motion First Usage

This introduces Framer Motion's gesture system to the frontend for the first time. The `motion` component wrapper and `onPointerDown` event are lightweight — they don't require wrapping the entire app in a motion provider. This establishes a pattern for future gesture-based interactions.

## Acceptance Criteria

- [ ] Long-press (500ms) on album title opens inline editor with current value pre-selected
- [ ] Long-press on album artist opens inline editor
- [ ] Long-press on track title opens inline editor
- [ ] Enter key saves the edited value and exits edit mode
- [ ] Blur (tap/click elsewhere) saves the edited value and exits edit mode
- [ ] Escape key cancels editing and reverts to original value
- [ ] Empty or whitespace-only input is rejected (reverts, no save)
- [ ] Unchanged values do not trigger a mutation (no-op guard)
- [ ] Edits persist across page navigation (verify by navigating away and back)
- [ ] Home page album cards reflect renamed album title/artist after navigating back
- [ ] Source-backed albums show no edit affordance (long-press does nothing)
- [ ] Long-press on a track title does NOT also trigger track playback
- [ ] Native mobile context menu is suppressed during long-press on editable fields
- [ ] Error toast appears if the mutation fails, and the field reverts to the pre-edit value
- [ ] `updateAlbum` mutation accepts partial updates (title only, artist only, or both)
- [ ] `updateTrack` mutation validates that `id` exists and `title` is non-empty

## Success Metrics

- Users can rename any library album/track metadata field in a single interaction (long-press → type → Enter)
- No regressions in playback from album detail page or search results
- No regressions in source-backed album browsing

## Dependencies & Risks

**Dependencies:**
- Framer Motion (already installed, v12.28.1) — first frontend usage
- Drizzle ORM `update` pattern (proven in `server/scripts/enrich-library.ts:296`)

**Risks:**
- **Discoverability:** No visible affordance indicates fields are editable. Users must discover long-press through exploration or documentation. Acceptable for v1; a tooltip hint can be added later.
- **Gesture feel on desktop:** Long-press with a mouse is less natural than on mobile. Desktop users may prefer double-click. Acceptable for v1 since the app is primarily mobile-focused.
- **Accessibility:** Keyboard-only users cannot long-press. No keyboard alternative (e.g., F2) is included in v1. Track as a follow-up.

## Deferred to Follow-Up

- **Track artist display + editing** — Track artist is not currently rendered in the track list UI. Adding it is a separate scope item.
- **Keyboard-accessible edit trigger** (F2 or Enter-to-edit when focused)
- **Discoverability hint** (one-time tooltip or onboarding toast)
- **Queue metadata sync** (updating now-playing bar when metadata changes)
- **Undo/revert to original source value**

## References & Research

### Internal References

- Album detail page: `src/web/features/album-detail/album-detail-page.tsx:253-258` (title/artist), `:324` (track title)
- Source-backed detection: `src/web/features/album-detail/album-detail-page.tsx:69`
- Library router mutations: `server/routers/library.ts:149-157` (removeAlbum pattern)
- Drizzle update pattern: `server/scripts/enrich-library.ts:296-298`
- DB schema albums: `src/db/schema.ts:17-26`
- DB schema albumTracks: `src/db/schema.ts:45-57`
- Keyboard shortcut guard: `src/web/shared/lib/shortcuts.ts:57-62`
- Rename station dialog (alternate pattern): `src/web/features/stations/rename-station-dialog.tsx`
- Input component: `src/web/shared/ui/input.tsx`
- Brainstorm: `docs/brainstorms/2026-02-10-rename-library-metadata-brainstorm.md`
- Album browsing solution: `docs/solutions/feature-patterns/2026-02-10-album-browsing-without-save.md`

### Implementation Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/web/shared/ui/editable-text.tsx` | Create | Reusable inline-edit component with long-press gesture |
| `server/routers/library.ts` | Modify | Add `updateAlbum` and `updateTrack` mutations |
| `src/web/features/album-detail/album-detail-page.tsx` | Modify | Wrap title/artist/track-title with `EditableText` |
