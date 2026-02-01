# TUI-Web Feature Parity: Up Next Queue + Create Station from Bookmark

## Goal

Close the two most meaningful feature gaps between the TUI and web app:
1. **Up Next queue display** — Show upcoming tracks on the now-playing page so users have playback context
2. **Create station from bookmark** — Let users create Pandora stations directly from their bookmarked artists/songs

---

## Feature 1: Up Next Queue Display

### Requirements

- Show the next 4 upcoming tracks below the playback controls on the now-playing page
- Display track name and artist for each queued track
- Show "+N more" indicator when more than 4 tracks remain
- Clicking a queued track jumps to it (reuses existing `handleJumpToTrack`)
- Visible in all playback modes (Pandora station, unified playlist, album)
- In album mode, the existing "Tracklist" section already serves this purpose — show "Up Next" only for non-album modes
- Hide when no upcoming tracks remain (e.g., last track of a Pandora batch)

### Source Files

| File | Role |
|------|------|
| `src/web/routes/now-playing.tsx` | Add Up Next section after controls, before TrackInfoModal |
| `src/tui/components/playback/QueueList.tsx` | Reference: TUI implementation pattern |

### Data Source

The queue is already available — it's derived from existing state:

```typescript
// tracks = all loaded tracks, trackIndex = current position
const upNextTracks = tracks.slice(trackIndex + 1, trackIndex + 5);
const remainingCount = tracks.length - trackIndex - 1;
```

No new API calls, hooks, or state needed.

### UI Concept

```html
<!-- Up Next section — appears below secondary actions, above TrackInfoModal -->
<!-- Only shown when NOT in album mode (album mode has its own Tracklist) -->
<div class="w-full max-w-md">
  <h3 class="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
    Up Next
  </h3>
  <div class="space-y-0.5">
    <!-- Queued track item (clickable) -->
    <button class="w-full flex items-center gap-3 px-3 py-2 rounded text-left text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors">
      <span class="w-5 text-right text-xs text-zinc-600">1</span>
      <span class="flex-1 truncate">Song Title Here</span>
      <span class="text-xs text-zinc-600 truncate max-w-[140px]">Artist Name</span>
    </button>
    <button class="w-full flex items-center gap-3 px-3 py-2 rounded text-left text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors">
      <span class="w-5 text-right text-xs text-zinc-600">2</span>
      <span class="flex-1 truncate">Another Song</span>
      <span class="text-xs text-zinc-600 truncate max-w-[140px]">Different Artist</span>
    </button>
    <button class="w-full flex items-center gap-3 px-3 py-2 rounded text-left text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors">
      <span class="w-5 text-right text-xs text-zinc-600">3</span>
      <span class="flex-1 truncate">Third Track</span>
      <span class="text-xs text-zinc-600 truncate max-w-[140px]">Someone Else</span>
    </button>
    <button class="w-full flex items-center gap-3 px-3 py-2 rounded text-left text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors">
      <span class="w-5 text-right text-xs text-zinc-600">4</span>
      <span class="flex-1 truncate">Fourth One</span>
      <span class="text-xs text-zinc-600 truncate max-w-[140px]">Yet Another</span>
    </button>
    <!-- Remaining count -->
    <p class="text-xs text-zinc-600 px-3 py-1">+3 more</p>
  </div>
</div>
```

### Placement

Insert at `src/web/routes/now-playing.tsx:605` — after the album tracklist block, before TrackInfoModal. Condition: `!isAlbumMode && upNextTracks.length > 0`.

---

## Feature 2: Create Station from Bookmark

### Requirements

- Add a "Create station" button to each bookmark item (artist and song)
- Uses the existing `stations.create` tRPC mutation with `musicToken` + `musicType`
- Both bookmark types already have `musicToken` in their API response
- On success: show toast, invalidate stations list
- On error: show error toast
- Button appears on hover alongside the existing delete button

### Source Files

| File | Role |
|------|------|
| `src/web/routes/bookmarks.tsx` | Add createStation mutation + button to each bookmark item |
| `src/web/routes/search.tsx` | Reference: existing station creation pattern |
| `server/routers/stations.ts` | Already supports `{ musicToken, musicType }` input — no changes needed |
| `src/tui/components/bookmarks/BookmarksView.tsx` | Reference: TUI passes `musicToken` + `musicType` |

### UI Concept

```html
<!-- Artist bookmark item with both Create Station and Delete buttons -->
<li class="flex items-center gap-3 p-3 rounded-lg hover:bg-zinc-800/50 group">
  <!-- Avatar -->
  <div class="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
    <svg class="w-5 h-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
    </svg>
  </div>
  <!-- Name -->
  <span class="flex-1 text-zinc-200">Pink Floyd</span>
  <!-- Action buttons (visible on hover) -->
  <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
    <button class="p-2 rounded text-zinc-500 hover:text-emerald-400 hover:bg-zinc-800 transition-colors" title="Create station">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
      </svg>
    </button>
    <button class="p-2 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors" title="Remove bookmark">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
      </svg>
    </button>
  </div>
</li>

<!-- Song bookmark item -->
<li class="flex items-center gap-3 p-3 rounded-lg hover:bg-zinc-800/50 group">
  <div class="w-10 h-10 rounded bg-zinc-800 flex items-center justify-center shrink-0">
    <svg class="w-5 h-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/>
    </svg>
  </div>
  <div class="flex-1 min-w-0">
    <p class="text-zinc-200 truncate">Wish You Were Here</p>
    <p class="text-xs text-zinc-500">Pink Floyd</p>
  </div>
  <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
    <button class="p-2 rounded text-zinc-500 hover:text-emerald-400 hover:bg-zinc-800 transition-colors" title="Create station">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
      </svg>
    </button>
    <button class="p-2 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors" title="Remove bookmark">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
      </svg>
    </button>
  </div>
</li>
```

### Implementation Notes

- Import `Radio` (or `Plus`) icon from `lucide-react` for the create button
- Add `trpc.stations.create.useMutation` hook (same pattern as `src/web/routes/search.tsx:19-27`)
- Pass `musicType: "artist"` or `musicType: "song"` to distinguish bookmark type (following TUI pattern)
- Invalidate `stations.list` on success
- No server changes required — `server/routers/stations.ts` already accepts `{ musicToken, musicType }`

---

## Acceptance Criteria

- [ ] Now-playing page shows "Up Next" section with next 4 tracks for station/playlist modes
- [ ] "Up Next" is hidden in album mode (existing Tracklist serves this role)
- [ ] "Up Next" is hidden when no upcoming tracks exist
- [ ] Clicking a track in "Up Next" jumps to that track
- [ ] "+N more" shows when more than 4 tracks remain in queue
- [ ] Bookmark items show "Create station" button on hover
- [ ] Creating a station from a bookmark shows success toast and refreshes station list
- [ ] Artist bookmarks pass `musicType: "artist"`, song bookmarks pass `musicType: "song"`
- [ ] Failed station creation shows error toast
