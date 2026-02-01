# Keyboard Shortcuts, Command Palette & Theme System

## Goal

Add three power-user features to the Pyxis web app that bring it closer to the TUI experience: global keyboard shortcuts, a command palette (Cmd+K), and a multi-theme system porting the 8 existing TUI themes.

## Requirements

- Keyboard shortcuts for all major actions (playback, navigation, station management)
- Command palette with fuzzy search, keyboard navigation, and category grouping
- Theme system using CSS custom properties with 8 themes ported from TUI
- Theme persists across sessions (localStorage)
- Shortcuts disabled when typing in inputs/textareas
- Command palette accessible via Cmd+K (Mac) / Ctrl+K (other)

---

## Phase 1: Theme System

**Goal**: CSS custom property-based theming with 8 themes, context provider, and persistence.

### Approach

Port the TUI's `PyxisTheme` color tokens to CSS custom properties. Replace hardcoded Tailwind color classes (`bg-zinc-900`, `text-zinc-100`, etc.) with semantic CSS variable references. This lets themes swap all colors at once.

### Files to Create

| File | Purpose |
|------|---------|
| `src/web/lib/themes.ts` | Theme definitions (8 themes, color maps) |
| `src/web/contexts/ThemeContext.tsx` | ThemeProvider + useTheme hook |

### Files to Modify

| File | Change |
|------|--------|
| `src/web/index.css` | Add CSS variable declarations for theme tokens |
| `src/web/main.tsx` | Wrap with ThemeProvider |
| All components using hardcoded colors | Replace with CSS variable references |

### Theme Token Mapping

Map TUI theme colors to CSS custom properties used via Tailwind:

| TUI Token | CSS Variable | Tailwind Usage | Current Hardcoded |
|-----------|-------------|----------------|-------------------|
| `background` | `--color-bg` | `bg-[var(--color-bg)]` | `bg-zinc-900` |
| `backgroundPanel` | `--color-bg-panel` | `bg-[var(--color-bg-panel)]` | `bg-zinc-800` |
| `backgroundHighlight` | `--color-bg-highlight` | `bg-[var(--color-bg-highlight)]` | `bg-zinc-800/50` |
| `backgroundSelection` | `--color-bg-selection` | `bg-[var(--color-bg-selection)]` | `bg-cyan-500/10` |
| `text` | `--color-text` | `text-[var(--color-text)]` | `text-zinc-100` |
| `textMuted` | `--color-text-muted` | `text-[var(--color-text-muted)]` | `text-zinc-400` |
| `textDim` | `--color-text-dim` | `text-[var(--color-text-dim)]` | `text-zinc-500` |
| `border` | `--color-border` | `border-[var(--color-border)]` | `border-zinc-800` |
| `borderActive` | `--color-border-active` | `border-[var(--color-border-active)]` | `border-cyan-500` |
| `accent` | `--color-accent` | `text-[var(--color-accent)]` | `text-cyan-400` |
| `primary` | `--color-primary` | `bg-[var(--color-primary)]` | `bg-cyan-500` |
| `error` | `--color-error` | `text-[var(--color-error)]` | `text-red-500` |
| `success` | `--color-success` | `text-[var(--color-success)]` | `text-green-500` |
| `warning` | `--color-warning` | `text-[var(--color-warning)]` | `text-yellow-500` |
| `playing` | `--color-playing` | `text-[var(--color-playing)]` | `text-cyan-400` |
| `liked` | `--color-liked` | `text-[var(--color-liked)]` | `text-green-500` |
| `disliked` | `--color-disliked` | `text-[var(--color-disliked)]` | `text-red-500` |
| `progress` | `--color-progress` | `bg-[var(--color-progress)]` | `bg-cyan-500` |
| `progressTrack` | `--color-progress-track` | `bg-[var(--color-progress-track)]` | `bg-zinc-800` |

### Themes to Port

Source files in `src/tui/theme/themes/`:

| Theme | Source File | Character |
|-------|-----------|-----------|
| Pyxis | `pyxis.json` | Pink/gold on deep navy |
| Tokyo Night | `tokyonight.json` | Purple/blue on dark blue |
| Catppuccin | `catppuccin.json` | Pastel on warm dark |
| Nord | `nord.json` | Cool blues on polar night |
| Gruvbox | `gruvbox.json` | Warm retro on dark brown |
| Dracula | `dracula.json` | Purple/green on charcoal |
| Rose Pine | `rose-pine.json` | Pink/gold on dark purple |
| System | `system.json` | Cyan on pure dark (current default) |

### ThemeContext API

```typescript
type ThemeContextValue = {
  theme: string           // Theme name
  setTheme: (name: string) => void
  themes: string[]        // Available theme names
}
```

### Acceptance Criteria (Phase 1)

- [ ] 8 themes available and switchable
- [ ] All UI elements use CSS variable-based colors
- [ ] Theme persists in localStorage across page loads
- [ ] No flash of wrong theme on page load

---

## Phase 2: Keyboard Shortcuts

**Goal**: Global keyboard shortcut system with input-awareness.

### Files to Create

| File | Purpose |
|------|---------|
| `src/web/hooks/useKeyboardShortcuts.ts` | Global keyboard listener hook |
| `src/web/lib/shortcuts.ts` | Shortcut registry + definitions |

### Files to Modify

| File | Change |
|------|--------|
| `src/web/routes/__root.tsx` | Mount keyboard shortcut handler |

### Shortcut Map

Port from TUI's keybind system (`src/tui/App.tsx` lines 502-747):

| Key | Action | Context |
|-----|--------|---------|
| `Space` | Play/pause | Global |
| `n` | Skip to next track | Global |
| `+` or `=` | Like current track | Global |
| `-` | Dislike current track | Global |
| `z` | Sleep current track | Global |
| `i` | Toggle track info modal | When playing |
| `b` | Bookmark song | When playing |
| `B` (shift+b) | Bookmark artist | When playing |
| `/` | Focus search / go to search | Global |
| `?` | Toggle help overlay | Global |
| `Cmd+K` / `Ctrl+K` | Open command palette | Global |
| `Escape` | Close overlay / go back | Global |
| `1` | Go to Stations | Global |
| `2` | Go to Search | Global |
| `3` | Go to Bookmarks | Global |
| `4` | Go to Genres | Global |
| `5` | Go to Settings | Global |

### Implementation Pattern

```typescript
// src/web/lib/shortcuts.ts
type Shortcut = {
  key: string
  modifiers?: ('ctrl' | 'meta' | 'shift' | 'alt')[]
  action: string     // Action ID (matches command palette)
  label: string      // Display name
  context?: 'global' | 'playing' | 'stations'
}
```

Hook behavior:
- Attaches `keydown` listener to `document`
- Ignores when `activeElement` is `input`, `textarea`, or `[contenteditable]`
- Ignores when a dialog/modal is open (except Escape)
- Calls registered action handlers
- Supports modifier keys (Cmd/Ctrl)

### Acceptance Criteria (Phase 2)

- [ ] All shortcuts from table above work
- [ ] Shortcuts disabled when typing in input fields
- [ ] Shortcuts disabled when modal is open (except Escape)
- [ ] Modifier keys (Cmd/Ctrl) work correctly

---

## Phase 3: Command Palette

**Goal**: Searchable command palette (Cmd+K) with fuzzy filtering, keyboard navigation, and action execution.

### Files to Create

| File | Purpose |
|------|---------|
| `src/web/components/overlays/CommandPalette.tsx` | Command palette UI |
| `src/web/lib/commands.ts` | Command registry |

### Files to Modify

| File | Change |
|------|--------|
| `src/web/routes/__root.tsx` | Add CommandPalette to layout |
| `src/web/hooks/useKeyboardShortcuts.ts` | Wire Cmd+K to open palette |

### Command Registry

Port from TUI's command list (`src/tui/App.tsx` lines 115-168) and expand:

| Category | Commands |
|----------|----------|
| **Navigation** | Go to Stations, Go to Search, Go to Bookmarks, Go to Genres, Go to Settings, Go to Now Playing |
| **Playback** | Play/Pause, Skip Track, Like Track, Dislike Track, Sleep Track |
| **Station** | Rename Station, Delete Station, Station Details, Manage Seeds, Manage QuickMix |
| **Bookmarks** | Bookmark Song, Bookmark Artist |
| **Appearance** | Change Theme (opens sub-picker) |
| **System** | Sign Out |

### UI Concept: Command Palette

```html
<!-- Backdrop -->
<div class="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-[20vh]"
     onclick="this.classList.add('hidden')">

  <!-- Palette container -->
  <div class="w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden">

    <!-- Search input -->
    <div class="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
      <svg class="w-5 h-5 text-zinc-500 shrink-0"><!-- search icon --></svg>
      <input
        type="text"
        placeholder="Type a command..."
        class="flex-1 bg-transparent text-zinc-100 placeholder-zinc-500 outline-none text-sm"
        autofocus
      />
      <kbd class="px-1.5 py-0.5 text-[10px] text-zinc-500 bg-zinc-800 rounded border border-zinc-700">ESC</kbd>
    </div>

    <!-- Results -->
    <div class="max-h-80 overflow-y-auto py-2">

      <!-- Category: Playback -->
      <div class="px-3 py-1">
        <p class="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Playback</p>
      </div>

      <!-- Selected item -->
      <button class="w-full flex items-center gap-3 px-4 py-2 bg-zinc-800 text-left">
        <svg class="w-4 h-4 text-zinc-400"><!-- play icon --></svg>
        <span class="flex-1 text-sm text-zinc-100">Play / Pause</span>
        <kbd class="px-1.5 py-0.5 text-[10px] text-zinc-500 bg-zinc-800 rounded border border-zinc-700">Space</kbd>
      </button>

      <!-- Normal item -->
      <button class="w-full flex items-center gap-3 px-4 py-2 hover:bg-zinc-800/50 text-left">
        <svg class="w-4 h-4 text-zinc-400"><!-- skip icon --></svg>
        <span class="flex-1 text-sm text-zinc-300">Skip Track</span>
        <kbd class="px-1.5 py-0.5 text-[10px] text-zinc-500 bg-zinc-800 rounded border border-zinc-700">N</kbd>
      </button>

      <button class="w-full flex items-center gap-3 px-4 py-2 hover:bg-zinc-800/50 text-left">
        <svg class="w-4 h-4 text-green-500"><!-- thumbs up --></svg>
        <span class="flex-1 text-sm text-zinc-300">Like Track</span>
        <kbd class="px-1.5 py-0.5 text-[10px] text-zinc-500 bg-zinc-800 rounded border border-zinc-700">+</kbd>
      </button>

      <!-- Category: Navigation -->
      <div class="px-3 py-1 mt-2">
        <p class="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Navigation</p>
      </div>

      <button class="w-full flex items-center gap-3 px-4 py-2 hover:bg-zinc-800/50 text-left">
        <svg class="w-4 h-4 text-zinc-400"><!-- radio icon --></svg>
        <span class="flex-1 text-sm text-zinc-300">Go to Stations</span>
        <kbd class="px-1.5 py-0.5 text-[10px] text-zinc-500 bg-zinc-800 rounded border border-zinc-700">1</kbd>
      </button>

      <button class="w-full flex items-center gap-3 px-4 py-2 hover:bg-zinc-800/50 text-left">
        <svg class="w-4 h-4 text-zinc-400"><!-- search icon --></svg>
        <span class="flex-1 text-sm text-zinc-300">Go to Search</span>
        <kbd class="px-1.5 py-0.5 text-[10px] text-zinc-500 bg-zinc-800 rounded border border-zinc-700">2</kbd>
      </button>

      <!-- Category: Appearance -->
      <div class="px-3 py-1 mt-2">
        <p class="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Appearance</p>
      </div>

      <button class="w-full flex items-center gap-3 px-4 py-2 hover:bg-zinc-800/50 text-left">
        <svg class="w-4 h-4 text-zinc-400"><!-- palette icon --></svg>
        <span class="flex-1 text-sm text-zinc-300">Change Theme</span>
        <span class="text-[10px] text-zinc-500">→</span>
      </button>
    </div>

    <!-- Footer hint -->
    <div class="flex items-center justify-between px-4 py-2 border-t border-zinc-800 text-[10px] text-zinc-600">
      <div class="flex gap-3">
        <span><kbd class="px-1 bg-zinc-800 rounded border border-zinc-700">↑↓</kbd> navigate</span>
        <span><kbd class="px-1 bg-zinc-800 rounded border border-zinc-700">⏎</kbd> select</span>
        <span><kbd class="px-1 bg-zinc-800 rounded border border-zinc-700">esc</kbd> close</span>
      </div>
    </div>
  </div>
</div>
```

### UI Concept: Theme Sub-Picker (within command palette)

```html
<!-- When "Change Theme" is selected, palette switches to theme list -->
<div class="max-h-80 overflow-y-auto py-2">

  <!-- Back button -->
  <button class="w-full flex items-center gap-3 px-4 py-2 hover:bg-zinc-800/50 text-left text-zinc-500">
    <svg class="w-4 h-4"><!-- arrow left --></svg>
    <span class="text-sm">Back to commands</span>
  </button>

  <div class="px-3 py-1 mt-1">
    <p class="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Themes</p>
  </div>

  <!-- Active theme -->
  <button class="w-full flex items-center gap-3 px-4 py-2 bg-zinc-800 text-left">
    <div class="w-4 h-4 rounded-full" style="background: linear-gradient(135deg, #ff6b9d, #f8b500)"></div>
    <span class="flex-1 text-sm text-zinc-100">Pyxis</span>
    <svg class="w-4 h-4 text-cyan-400"><!-- check icon --></svg>
  </button>

  <!-- Other themes -->
  <button class="w-full flex items-center gap-3 px-4 py-2 hover:bg-zinc-800/50 text-left">
    <div class="w-4 h-4 rounded-full" style="background: linear-gradient(135deg, #7aa2f7, #bb9af7)"></div>
    <span class="flex-1 text-sm text-zinc-300">Tokyo Night</span>
  </button>

  <button class="w-full flex items-center gap-3 px-4 py-2 hover:bg-zinc-800/50 text-left">
    <div class="w-4 h-4 rounded-full" style="background: linear-gradient(135deg, #f5e0dc, #cba6f7)"></div>
    <span class="flex-1 text-sm text-zinc-300">Catppuccin</span>
  </button>

  <button class="w-full flex items-center gap-3 px-4 py-2 hover:bg-zinc-800/50 text-left">
    <div class="w-4 h-4 rounded-full" style="background: linear-gradient(135deg, #88c0d0, #81a1c1)"></div>
    <span class="flex-1 text-sm text-zinc-300">Nord</span>
  </button>

  <button class="w-full flex items-center gap-3 px-4 py-2 hover:bg-zinc-800/50 text-left">
    <div class="w-4 h-4 rounded-full" style="background: linear-gradient(135deg, #fabd2f, #fb4934)"></div>
    <span class="flex-1 text-sm text-zinc-300">Gruvbox</span>
  </button>

  <button class="w-full flex items-center gap-3 px-4 py-2 hover:bg-zinc-800/50 text-left">
    <div class="w-4 h-4 rounded-full" style="background: linear-gradient(135deg, #bd93f9, #50fa7b)"></div>
    <span class="flex-1 text-sm text-zinc-300">Dracula</span>
  </button>

  <button class="w-full flex items-center gap-3 px-4 py-2 hover:bg-zinc-800/50 text-left">
    <div class="w-4 h-4 rounded-full" style="background: linear-gradient(135deg, #ebbcba, #f6c177)"></div>
    <span class="flex-1 text-sm text-zinc-300">Rosé Pine</span>
  </button>

  <button class="w-full flex items-center gap-3 px-4 py-2 hover:bg-zinc-800/50 text-left">
    <div class="w-4 h-4 rounded-full" style="background: linear-gradient(135deg, #22d3ee, #06b6d4)"></div>
    <span class="flex-1 text-sm text-zinc-300">System</span>
  </button>
</div>
```

### Acceptance Criteria (Phase 3)

- [ ] Cmd+K / Ctrl+K opens command palette
- [ ] Fuzzy search filters commands as you type
- [ ] Arrow keys navigate, Enter executes, Escape closes
- [ ] Commands are grouped by category
- [ ] Shortcuts displayed next to each command
- [ ] "Change Theme" opens theme sub-picker with live preview
- [ ] Clicking backdrop closes palette

---

## Source Files Summary

### Existing (Reference)

| File | Used For |
|------|----------|
| `src/tui/theme/types.ts` | Theme type definition to port |
| `src/tui/theme/themes/*.json` | 8 theme color definitions to port |
| `src/tui/theme/provider.tsx` | Provider pattern reference |
| `src/tui/components/overlays/CommandPalette.tsx` | Command palette UX reference |
| `src/tui/components/overlays/HelpOverlay.tsx` | Shortcut mapping reference |
| `src/tui/App.tsx` (lines 115-168) | Command definitions |
| `src/tui/App.tsx` (lines 502-747) | Keybind mapping |

### New Files

| File | Purpose |
|------|----------|
| `src/web/lib/themes.ts` | Theme definitions + CSS variable mapping |
| `src/web/lib/shortcuts.ts` | Shortcut registry + definitions |
| `src/web/lib/commands.ts` | Command registry for palette |
| `src/web/contexts/ThemeContext.tsx` | Theme provider + hook |
| `src/web/hooks/useKeyboardShortcuts.ts` | Global keyboard listener |
| `src/web/components/overlays/CommandPalette.tsx` | Command palette component |

### Modified Files

| File | Change |
|------|--------|
| `src/web/index.css` | CSS variable declarations for theme tokens |
| `src/web/main.tsx` | Add ThemeProvider |
| `src/web/routes/__root.tsx` | Mount keyboard handler + command palette |
| `src/web/components/layout/RootLayout.tsx` | Wire up keyboard + command palette |
| `src/web/components/layout/Sidebar.tsx` | Use theme CSS variables |
| `src/web/components/layout/NowPlayingBar.tsx` | Use theme CSS variables |
| `src/web/routes/index.tsx` | Use theme CSS variables |
| `src/web/routes/now-playing.tsx` | Use theme CSS variables |
| `src/web/routes/search.tsx` | Use theme CSS variables |
| `src/web/routes/bookmarks.tsx` | Use theme CSS variables |
| `src/web/routes/genres.tsx` | Use theme CSS variables |
| `src/web/routes/settings.tsx` | Use theme CSS variables |
| `src/web/routes/login.tsx` | Use theme CSS variables |
| `src/web/components/stations/*` | Use theme CSS variables |
| `src/web/components/playback/*` | Use theme CSS variables |
| `src/web/components/search/*` | Use theme CSS variables |
| `src/web/components/ui/*` | Use theme CSS variables |
