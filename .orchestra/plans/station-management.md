# Track Info Modal & Station Context Menus

## Goal

Add two missing features to the web UI:
1. **Station context menus** - Delete, rename, and view details for any station
2. **Track info modal** - Show song details + Music Genome traits on now-playing page

All backend endpoints exist. The station management endpoints (`stations.delete`, `stations.rename`, `stations.getStation`) are ready. Track explanation needs one new server endpoint (`playback.explainTrack`).

## Requirements

- Context menu (dropdown) on each station row with Details, Rename, Delete actions
- Confirm dialog before delete (destructive, irreversible)
- Inline rename via a dialog
- Station details page showing seeds and feedback history
- Track info modal on now-playing page showing Music Genome traits
- Install `@radix-ui/react-dropdown-menu` for context menu component
- Toast notifications for all mutations

---

## Part A: Shared UI Primitives

### Install Dependency

```bash
bun add @radix-ui/react-dropdown-menu
```

### Files to Create

| File | Purpose |
|------|---------|
| `src/web/components/ui/dialog.tsx` | Reusable modal dialog (Radix-style overlay + panel) |
| `src/web/components/ui/dropdown-menu.tsx` | Thin Radix dropdown wrapper with Tailwind styling |

### UI Concept: Dialog Component

```html
<!-- Reusable dialog shell used by delete confirm, rename, and track info -->
<div class="fixed inset-0 z-50 flex items-center justify-center">
  <!-- Backdrop -->
  <div class="fixed inset-0 bg-black/60" onclick="close()"></div>
  <!-- Panel -->
  <div class="relative bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-sm w-full shadow-2xl mx-4">
    <!-- Content slot -->
  </div>
</div>
```

### UI Concept: Dropdown Menu

```html
<!-- Triggered by ellipsis button on station row -->
<div class="absolute right-0 top-full mt-1 w-48 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 py-1">
  <button class="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700 text-left">
    <svg class="w-4 h-4"><!-- info icon --></svg>
    Station Details
  </button>
  <button class="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700 text-left">
    <svg class="w-4 h-4"><!-- pencil icon --></svg>
    Rename
  </button>
  <div class="border-t border-zinc-700 my-1"></div>
  <button class="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-zinc-700 text-left">
    <svg class="w-4 h-4"><!-- trash icon --></svg>
    Delete Station
  </button>
</div>
```

---

## Part B: Station Context Menu & Mutations

### Source Files (Backend - Already Complete)

| File | Endpoint | Notes |
|------|----------|-------|
| `server/routers/stations.ts:39-46` | `stations.delete` | Input: `{stationToken}` |
| `server/routers/stations.ts:48-59` | `stations.rename` | Input: `{stationToken, stationName}` |
| `server/routers/stations.ts:14-23` | `stations.getStation` | Returns seeds + feedback |

### Files to Create

| File | Purpose |
|------|---------|
| `src/web/components/stations/StationContextMenu.tsx` | Dropdown with Details, Rename, Delete |
| `src/web/components/stations/DeleteStationDialog.tsx` | Confirm dialog with station name |
| `src/web/components/stations/RenameStationDialog.tsx` | Form dialog with name input |

### Files to Modify

| File | Change |
|------|--------|
| `src/web/components/stations/StationList.tsx` | Add ellipsis button + context menu per row |
| `src/web/routes/index.tsx` | Wire up delete/rename mutations, manage dialog state |

### UI Concept: Station Row with Menu

```html
<li class="group">
  <div class="flex items-center gap-3 p-3 rounded-lg hover:bg-zinc-800">
    <!-- Station icon -->
    <div class="w-10 h-10 rounded bg-zinc-800 flex items-center justify-center">
      <svg class="w-5 h-5 text-zinc-500"><!-- radio --></svg>
    </div>

    <!-- Station name (click to play) -->
    <button class="flex-1 min-w-0 text-left">
      <p class="font-medium truncate text-zinc-300">My Station Name</p>
    </button>

    <!-- Ellipsis trigger (visible on hover, always on mobile) -->
    <div class="relative">
      <button class="p-1.5 rounded hover:bg-zinc-700 opacity-0 group-hover:opacity-100 md:opacity-0 transition-opacity">
        <svg class="w-4 h-4 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>
        </svg>
      </button>
      <!-- Radix DropdownMenu portal renders here -->
    </div>
  </div>
</li>
```

### UI Concept: Delete Confirmation

```html
<div class="fixed inset-0 z-50 flex items-center justify-center">
  <div class="fixed inset-0 bg-black/60"></div>
  <div class="relative bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-sm w-full shadow-2xl mx-4">
    <div class="flex items-center gap-3 mb-4">
      <div class="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
        <svg class="w-5 h-5 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
      </div>
      <h2 class="text-lg font-semibold text-zinc-100">Delete Station</h2>
    </div>
    <p class="text-sm text-zinc-400 mb-1">Are you sure you want to delete</p>
    <p class="text-sm font-medium text-zinc-200 mb-4">"My Favorite Station"?</p>
    <p class="text-xs text-zinc-500 mb-6">This action cannot be undone.</p>
    <div class="flex gap-3 justify-end">
      <button class="px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 rounded-lg">Cancel</button>
      <button class="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-500 rounded-lg">Delete</button>
    </div>
  </div>
</div>
```

### UI Concept: Rename Dialog

```html
<div class="fixed inset-0 z-50 flex items-center justify-center">
  <div class="fixed inset-0 bg-black/60"></div>
  <div class="relative bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-sm w-full shadow-2xl mx-4">
    <h2 class="text-lg font-semibold text-zinc-100 mb-4">Rename Station</h2>
    <label class="block text-sm text-zinc-400 mb-1">Station name</label>
    <input
      type="text"
      value="My Favorite Station"
      class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 mb-6"
      autofocus
    />
    <div class="flex gap-3 justify-end">
      <button class="px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 rounded-lg">Cancel</button>
      <button class="px-4 py-2 text-sm text-zinc-900 bg-cyan-500 hover:bg-cyan-400 rounded-lg">Save</button>
    </div>
  </div>
</div>
```

---

## Part C: Station Details Page

### Files to Create

| File | Purpose |
|------|---------|
| `src/web/routes/station.$token.tsx` | Station details page (TanStack Router param route) |

### Files to Reference

| File | Types |
|------|-------|
| `src/types/api.ts:52-58` | `StationSeed` - seedId, artistName, songName, musicToken |
| `src/types/api.ts:60-66` | `StationFeedback` - feedbackId, songName, artistName, isPositive |
| `src/types/api.ts:68-80` | `GetStationResponse` - music.songs, music.artists, feedback.thumbsUp/Down |

### UI Concept: Station Details

```html
<div class="flex-1 p-4 space-y-6 max-w-2xl">
  <!-- Header with back -->
  <div class="flex items-center gap-3">
    <button class="p-2 hover:bg-zinc-800 rounded-lg">
      <svg class="w-5 h-5 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="m15 18-6-6 6-6"/>
      </svg>
    </button>
    <div>
      <h2 class="text-lg font-semibold text-zinc-100">Pink Floyd Radio</h2>
      <p class="text-sm text-zinc-500">Station details</p>
    </div>
  </div>

  <!-- Seeds -->
  <div>
    <h3 class="text-sm font-medium text-zinc-400 uppercase tracking-wide mb-3">Seeds</h3>

    <div class="space-y-1 mb-4">
      <p class="text-xs text-zinc-500 mb-1">Artists</p>
      <div class="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50">
        <div class="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center">
          <svg class="w-4 h-4 text-zinc-400"><!-- user --></svg>
        </div>
        <p class="text-sm text-zinc-300">Pink Floyd</p>
      </div>
    </div>

    <div class="space-y-1">
      <p class="text-xs text-zinc-500 mb-1">Songs</p>
      <div class="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50">
        <div class="w-8 h-8 rounded bg-zinc-700 flex items-center justify-center">
          <svg class="w-4 h-4 text-zinc-400"><!-- music --></svg>
        </div>
        <div>
          <p class="text-sm text-zinc-300">Comfortably Numb</p>
          <p class="text-xs text-zinc-500">Pink Floyd</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Feedback -->
  <div>
    <h3 class="text-sm font-medium text-zinc-400 uppercase tracking-wide mb-3">Feedback</h3>

    <div class="mb-4">
      <p class="text-xs text-zinc-500 mb-1 flex items-center gap-1">
        <svg class="w-3 h-3 text-green-500"><!-- thumbs up --></svg>
        Liked
      </p>
      <div class="space-y-1">
        <div class="flex items-center gap-3 p-2 rounded-lg bg-zinc-800/30">
          <p class="text-sm text-zinc-300 flex-1">Wish You Were Here</p>
          <p class="text-xs text-zinc-500">Pink Floyd</p>
        </div>
      </div>
    </div>

    <div>
      <p class="text-xs text-zinc-500 mb-1 flex items-center gap-1">
        <svg class="w-3 h-3 text-red-500"><!-- thumbs down --></svg>
        Disliked
      </p>
      <div class="space-y-1">
        <div class="flex items-center gap-3 p-2 rounded-lg bg-zinc-800/30">
          <p class="text-sm text-zinc-300 flex-1">Some Song</p>
          <p class="text-xs text-zinc-500">Some Artist</p>
        </div>
      </div>
    </div>
  </div>
</div>
```

---

## Part D: Track Info Modal

### Backend Addition

| File | Change |
|------|--------|
| `server/routers/playback.ts` | Add `explainTrack` query procedure |

New procedure:
```typescript
explainTrack: protectedProcedure
  .input(z.object({ trackToken: z.string() }))
  .query(async ({ ctx, input }) => {
    return Effect.runPromise(
      Pandora.explainTrack(ctx.pandoraSession, input.trackToken)
    );
  })
```

### Files to Create

| File | Purpose |
|------|---------|
| `src/web/components/playback/TrackInfoModal.tsx` | Modal showing track details + genome traits |

### Files to Modify

| File | Change |
|------|--------|
| `src/web/routes/now-playing.tsx` | Add "Info" button, manage modal open state |

### Data Sources

The modal displays two types of info:
1. **Track metadata** - Already available from `PlaylistItem` (songName, artistName, albumName, albumArtUrl)
2. **Music Genome traits** - Fetched via new `playback.explainTrack` endpoint using `trackToken`

### Types Reference

| File | Type | Fields |
|------|------|--------|
| `src/types/api.ts:345-348` | `TrackExplanation` | `focusTraitId`, `focusTraitName` |
| `src/types/api.ts:350-352` | `ExplainTrackResponse` | `explanations: TrackExplanation[]` |
| `src/types/api.ts:89-103` | `PlaylistItem` | songName, artistName, albumName, albumArtUrl, trackToken |

### UI Concept: Track Info Modal

```html
<div class="fixed inset-0 z-50 flex items-center justify-center">
  <div class="fixed inset-0 bg-black/60"></div>
  <div class="relative bg-zinc-900 border border-zinc-700 rounded-xl max-w-md w-full shadow-2xl mx-4 max-h-[80vh] flex flex-col">
    <!-- Header -->
    <div class="flex items-center justify-between p-4 border-b border-zinc-800">
      <h2 class="text-lg font-semibold text-zinc-100">Track Info</h2>
      <button class="p-1.5 hover:bg-zinc-800 rounded-lg">
        <svg class="w-5 h-5 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6 6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>

    <!-- Scrollable body -->
    <div class="flex-1 overflow-y-auto p-4 space-y-6">
      <!-- Track details -->
      <div class="flex gap-4">
        <img src="album.jpg" class="w-20 h-20 rounded-lg shrink-0" alt="" />
        <div class="min-w-0">
          <p class="font-semibold text-zinc-100 truncate">Comfortably Numb</p>
          <p class="text-sm text-zinc-400 truncate">Pink Floyd</p>
          <p class="text-sm text-zinc-500 truncate">The Wall</p>
          <p class="text-xs text-zinc-600 mt-1">Duration: 6:22</p>
        </div>
      </div>

      <!-- Music Genome Traits -->
      <div>
        <h3 class="text-sm font-medium text-zinc-400 uppercase tracking-wide mb-3">Music Genome Traits</h3>

        <!-- Loading state -->
        <div class="hidden flex items-center gap-2 py-3 text-zinc-500 text-sm">
          <svg class="w-4 h-4 animate-spin"><!-- spinner --></svg>
          Loading traits...
        </div>

        <!-- Trait list -->
        <div class="space-y-2">
          <div class="flex items-center gap-2 text-sm">
            <div class="w-1.5 h-1.5 rounded-full bg-cyan-500 shrink-0"></div>
            <span class="text-zinc-300">Classic rock roots</span>
          </div>
          <div class="flex items-center gap-2 text-sm">
            <div class="w-1.5 h-1.5 rounded-full bg-cyan-500 shrink-0"></div>
            <span class="text-zinc-300">Psychedelic influences</span>
          </div>
          <div class="flex items-center gap-2 text-sm">
            <div class="w-1.5 h-1.5 rounded-full bg-cyan-500 shrink-0"></div>
            <span class="text-zinc-300">Extended guitar solos</span>
          </div>
          <div class="flex items-center gap-2 text-sm">
            <div class="w-1.5 h-1.5 rounded-full bg-cyan-500 shrink-0"></div>
            <span class="text-zinc-300">Progressive song structure</span>
          </div>
          <div class="flex items-center gap-2 text-sm">
            <div class="w-1.5 h-1.5 rounded-full bg-cyan-500 shrink-0"></div>
            <span class="text-zinc-300">Major key tonality</span>
          </div>
        </div>

        <!-- Empty state -->
        <div class="hidden py-3 text-zinc-500 text-sm">
          No traits available for this track.
        </div>

        <!-- Error state -->
        <div class="hidden py-3 text-red-400 text-sm">
          Failed to load traits.
        </div>
      </div>
    </div>
  </div>
</div>
```

---

## Acceptance Criteria

### Station Context Menus
- [ ] Each station row shows a "..." button on hover (always visible on mobile)
- [ ] Dropdown offers: Station Details, Rename, Delete
- [ ] Rename/Delete hidden when `allowRename`/`allowDelete` is false
- [ ] Delete shows confirm dialog, then calls `stations.delete`
- [ ] Rename dialog pre-fills current name, calls `stations.rename`
- [ ] Both mutations invalidate `stations.list` query cache on success
- [ ] Toast notification on success/failure

### Station Details
- [ ] `/station/$token` route shows seeds (artists + songs) and feedback (liked + disliked)
- [ ] Back button returns to station list
- [ ] Loading skeleton while fetching
- [ ] Error state on failure

### Track Info Modal
- [ ] "Info" button on now-playing secondary actions row
- [ ] Modal shows song name, artist, album, album art, duration
- [ ] Fetches and displays Music Genome traits via `playback.explainTrack`
- [ ] Loading spinner while traits fetch
- [ ] Graceful error state if explain fails
- [ ] Close via X button or clicking backdrop
