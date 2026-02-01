# Web UX Polish: Theme Picker, Command Palette, Help Overlay

## Goal

Add the three remaining UX polish features to achieve full feature parity with the TUI:
1. **Theme Picker** - Switch between 8 color themes (port TUI JSON themes to CSS variables)
2. **Command Palette** - Keyboard-driven command interface (Cmd+K / Ctrl+K)
3. **Help Overlay** - Keyboard shortcut reference card (accessible via `?` key)

## Requirements

- Theme picker accessible from Settings page and command palette
- Themes persist to localStorage
- Command palette activated by `Cmd+K` / `Ctrl+K` globally
- Help overlay activated by `?` key when no input is focused
- All three features work on mobile (touch-friendly)

## Source Files

### Existing (Read-Only Reference)

| File | Purpose |
|------|---------|
| `src/tui/theme/types.ts` | Theme type definition (26 color tokens) |
| `src/tui/theme/themes/*.json` | 8 theme definitions: pyxis, dracula, catppuccin, gruvbox, nord, rose-pine, system, tokyonight |
| `src/tui/components/overlays/HelpOverlay.tsx` | TUI help layout (4 categories: navigation, playback, stations, system) |
| `src/tui/components/overlays/CommandPalette.tsx` | TUI command palette |
| `src/web/index.css` | Current minimal CSS (Tailwind import + 2 cyan overrides) |
| `src/web/routes/settings.tsx` | Settings page (add theme picker here) |
| `src/web/components/layout/RootLayout.tsx` | Root layout (register global keybinds here) |

### Files to Create

| File | Purpose |
|------|---------|
| `src/web/lib/themes.ts` | Theme definitions (CSS variable maps derived from TUI JSON) |
| `src/web/contexts/ThemeContext.tsx` | Theme state provider (current theme + setter, localStorage persistence) |
| `src/web/components/ui/ThemePicker.tsx` | Theme selection grid component |
| `src/web/components/ui/CommandPalette.tsx` | Command palette modal |
| `src/web/components/ui/HelpOverlay.tsx` | Keyboard shortcut reference overlay |
| `src/web/hooks/useGlobalKeybinds.ts` | Global keyboard shortcut handler |

### Files to Modify

| File | Change |
|------|--------|
| `src/web/index.css` | Add CSS custom properties for theme tokens + `.theme-*` classes |
| `src/web/routes/settings.tsx` | Add "Theme" section with theme picker |
| `src/web/components/layout/RootLayout.tsx` | Wrap with ThemeProvider, render CommandPalette + HelpOverlay |
| `src/web/main.tsx` | Wrap app with ThemeProvider |

---

## Feature 1: Theme Picker

### Theme System Design

Map TUI theme colors to CSS custom properties. Each theme sets variables on `<html>`:

```typescript
// src/web/lib/themes.ts
// Map TUI theme JSON tokens → CSS variable names
// background → --bg, backgroundPanel → --bg-panel, etc.
// Export array of { name, label, colors } objects
```

```css
/* Applied via ThemeContext setting data-theme on <html> */
html[data-theme="pyxis"] {
  --bg: #1a1a2e;
  --bg-panel: #16213e;
  --bg-highlight: #0f3460;
  --bg-selection: #533483;
  --border: #3a3a5c;
  --border-active: #ff6b9d;
  --text: #ffffff;
  --text-muted: #a0a0a0;
  --accent: #f8b500;
  --primary: #ff6b9d;
  --success: #2ed573;
  --error: #ff4757;
  --progress: #ff6b9d;
  /* ... */
}
```

### UI Concept: Theme Picker in Settings

```html
<div class="space-y-4">
  <h3 class="text-sm font-medium text-zinc-400">Theme</h3>
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
    <!-- Active theme -->
    <button class="flex flex-col items-center gap-2 p-3 rounded-lg border-2 border-cyan-500 bg-zinc-800/50">
      <div class="flex gap-1">
        <div class="w-4 h-4 rounded-full" style="background: #ff6b9d"></div>
        <div class="w-4 h-4 rounded-full" style="background: #f8b500"></div>
        <div class="w-4 h-4 rounded-full" style="background: #1a1a2e"></div>
      </div>
      <span class="text-xs font-medium text-cyan-400">Pyxis</span>
    </button>

    <!-- Inactive theme -->
    <button class="flex flex-col items-center gap-2 p-3 rounded-lg border border-zinc-700 hover:border-zinc-500 bg-zinc-800/30">
      <div class="flex gap-1">
        <div class="w-4 h-4 rounded-full" style="background: #bd93f9"></div>
        <div class="w-4 h-4 rounded-full" style="background: #f1fa8c"></div>
        <div class="w-4 h-4 rounded-full" style="background: #282a36"></div>
      </div>
      <span class="text-xs text-zinc-400">Dracula</span>
    </button>

    <button class="flex flex-col items-center gap-2 p-3 rounded-lg border border-zinc-700 hover:border-zinc-500 bg-zinc-800/30">
      <div class="flex gap-1">
        <div class="w-4 h-4 rounded-full" style="background: #cba6f7"></div>
        <div class="w-4 h-4 rounded-full" style="background: #f9e2af"></div>
        <div class="w-4 h-4 rounded-full" style="background: #1e1e2e"></div>
      </div>
      <span class="text-xs text-zinc-400">Catppuccin</span>
    </button>

    <button class="flex flex-col items-center gap-2 p-3 rounded-lg border border-zinc-700 hover:border-zinc-500 bg-zinc-800/30">
      <div class="flex gap-1">
        <div class="w-4 h-4 rounded-full" style="background: #d8dee9"></div>
        <div class="w-4 h-4 rounded-full" style="background: #88c0d0"></div>
        <div class="w-4 h-4 rounded-full" style="background: #2e3440"></div>
      </div>
      <span class="text-xs text-zinc-400">Nord</span>
    </button>

    <button class="flex flex-col items-center gap-2 p-3 rounded-lg border border-zinc-700 hover:border-zinc-500 bg-zinc-800/30">
      <div class="flex gap-1">
        <div class="w-4 h-4 rounded-full" style="background: #fb4934"></div>
        <div class="w-4 h-4 rounded-full" style="background: #fabd2f"></div>
        <div class="w-4 h-4 rounded-full" style="background: #282828"></div>
      </div>
      <span class="text-xs text-zinc-400">Gruvbox</span>
    </button>

    <button class="flex flex-col items-center gap-2 p-3 rounded-lg border border-zinc-700 hover:border-zinc-500 bg-zinc-800/30">
      <div class="flex gap-1">
        <div class="w-4 h-4 rounded-full" style="background: #ebbcba"></div>
        <div class="w-4 h-4 rounded-full" style="background: #f6c177"></div>
        <div class="w-4 h-4 rounded-full" style="background: #191724"></div>
      </div>
      <span class="text-xs text-zinc-400">Rose Pine</span>
    </button>

    <button class="flex flex-col items-center gap-2 p-3 rounded-lg border border-zinc-700 hover:border-zinc-500 bg-zinc-800/30">
      <div class="flex gap-1">
        <div class="w-4 h-4 rounded-full" style="background: #7aa2f7"></div>
        <div class="w-4 h-4 rounded-full" style="background: #e0af68"></div>
        <div class="w-4 h-4 rounded-full" style="background: #1a1b26"></div>
      </div>
      <span class="text-xs text-zinc-400">Tokyo Night</span>
    </button>

    <button class="flex flex-col items-center gap-2 p-3 rounded-lg border border-zinc-700 hover:border-zinc-500 bg-zinc-800/30">
      <div class="flex gap-1">
        <div class="w-4 h-4 rounded-full bg-zinc-300"></div>
        <div class="w-4 h-4 rounded-full bg-cyan-500"></div>
        <div class="w-4 h-4 rounded-full bg-zinc-900"></div>
      </div>
      <span class="text-xs text-zinc-400">System</span>
    </button>
  </div>
</div>
```

---

## Feature 2: Command Palette

### Commands

Map from TUI commands, adapted for web navigation:

| Command | Action | Shortcut |
|---------|--------|----------|
| Go to Stations | Navigate to `/` | — |
| Go to Search | Navigate to `/search` | — |
| Go to Bookmarks | Navigate to `/bookmarks` | — |
| Go to Genres | Navigate to `/genres` | — |
| Go to Settings | Navigate to `/settings` | — |
| Now Playing | Navigate to `/now-playing` | — |
| Like Track | Like current track | — |
| Dislike Track | Dislike current track | — |
| Skip Track | Skip to next | — |
| Change Theme | Open theme picker | — |
| Keyboard Shortcuts | Open help overlay | `?` |
| Sign Out | Logout | — |

### UI Concept: Command Palette

```html
<!-- Backdrop -->
<div class="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-[20vh]">
  <div class="w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden">
    <!-- Search input -->
    <div class="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
      <svg class="w-5 h-5 text-zinc-500 shrink-0"><!-- search icon --></svg>
      <input
        type="text"
        placeholder="Type a command..."
        class="flex-1 bg-transparent text-zinc-100 placeholder:text-zinc-500 focus:outline-none text-sm"
        autofocus
      />
      <kbd class="text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">esc</kbd>
    </div>

    <!-- Results -->
    <div class="max-h-[40vh] overflow-y-auto py-1">
      <!-- Active item -->
      <button class="w-full flex items-center gap-3 px-4 py-2.5 bg-zinc-800 text-left">
        <svg class="w-4 h-4 text-zinc-400"><!-- radio icon --></svg>
        <span class="text-sm text-zinc-100">Go to Stations</span>
      </button>

      <!-- Normal item -->
      <button class="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800/50 text-left">
        <svg class="w-4 h-4 text-zinc-500"><!-- search icon --></svg>
        <span class="text-sm text-zinc-300">Go to Search</span>
      </button>

      <button class="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800/50 text-left">
        <svg class="w-4 h-4 text-zinc-500"><!-- bookmark icon --></svg>
        <span class="text-sm text-zinc-300">Go to Bookmarks</span>
      </button>

      <button class="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800/50 text-left">
        <svg class="w-4 h-4 text-zinc-500"><!-- grid icon --></svg>
        <span class="text-sm text-zinc-300">Go to Genres</span>
      </button>

      <!-- Separator -->
      <div class="border-t border-zinc-800 my-1"></div>

      <button class="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800/50 text-left">
        <svg class="w-4 h-4 text-green-500"><!-- thumbs up icon --></svg>
        <span class="text-sm text-zinc-300">Like Track</span>
      </button>

      <button class="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800/50 text-left">
        <svg class="w-4 h-4 text-red-500"><!-- thumbs down icon --></svg>
        <span class="text-sm text-zinc-300">Dislike Track</span>
      </button>

      <button class="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800/50 text-left">
        <svg class="w-4 h-4 text-zinc-500"><!-- skip-forward icon --></svg>
        <span class="text-sm text-zinc-300">Skip Track</span>
      </button>

      <!-- Separator -->
      <div class="border-t border-zinc-800 my-1"></div>

      <button class="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800/50 text-left">
        <svg class="w-4 h-4 text-zinc-500"><!-- palette icon --></svg>
        <span class="text-sm text-zinc-300">Change Theme</span>
      </button>

      <button class="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800/50 text-left">
        <svg class="w-4 h-4 text-zinc-500"><!-- keyboard icon --></svg>
        <span class="text-sm text-zinc-300">Keyboard Shortcuts</span>
        <kbd class="ml-auto text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">?</kbd>
      </button>
    </div>
  </div>
</div>
```

---

## Feature 3: Help Overlay

### Keyboard Shortcuts (adapted for web)

4 categories matching TUI, adapted for browser context:

**Navigation**: `?` Help, `Cmd+K` Command palette, `Esc` Close/back

**Playback**: `Space` Play/pause, `N` Next track, `L` Like, `D` Dislike

**Stations**: Click to play, Right-click context menu, Filter with search box

**Pages**: Sidebar navigation (Stations, Search, Bookmarks, Genres, Settings)

### UI Concept: Help Overlay

```html
<div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
     onclick="this.remove()">
  <div class="bg-zinc-900 border border-zinc-700 rounded-xl max-w-xl w-full shadow-2xl p-6"
       onclick="event.stopPropagation()">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-lg font-semibold text-zinc-100">Keyboard Shortcuts</h2>
      <button class="p-1.5 hover:bg-zinc-800 rounded-lg">
        <svg class="w-5 h-5 text-zinc-400"><!-- x icon --></svg>
      </button>
    </div>

    <!-- Two-column grid -->
    <div class="grid grid-cols-2 gap-x-8 gap-y-6">
      <!-- Navigation -->
      <div>
        <h3 class="text-sm font-medium text-zinc-400 mb-3">Navigation</h3>
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-sm text-zinc-300">Command palette</span>
            <div class="flex gap-1">
              <kbd class="text-xs bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-700">Ctrl</kbd>
              <kbd class="text-xs bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-700">K</kbd>
            </div>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm text-zinc-300">Help</span>
            <kbd class="text-xs bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-700">?</kbd>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm text-zinc-300">Close / Back</span>
            <kbd class="text-xs bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-700">Esc</kbd>
          </div>
        </div>
      </div>

      <!-- Playback -->
      <div>
        <h3 class="text-sm font-medium text-zinc-400 mb-3">Playback</h3>
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-sm text-zinc-300">Play / Pause</span>
            <kbd class="text-xs bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-700">Space</kbd>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm text-zinc-300">Skip track</span>
            <kbd class="text-xs bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-700">N</kbd>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm text-zinc-300">Like</span>
            <kbd class="text-xs bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-700">L</kbd>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm text-zinc-300">Dislike</span>
            <kbd class="text-xs bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-700">D</kbd>
          </div>
        </div>
      </div>

      <!-- Stations -->
      <div>
        <h3 class="text-sm font-medium text-zinc-400 mb-3">Stations</h3>
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-sm text-zinc-300">Play station</span>
            <kbd class="text-xs bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-700">Click</kbd>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm text-zinc-300">Station options</span>
            <kbd class="text-xs bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-700">
              <svg class="w-3 h-3 inline"><!-- more-vertical --></svg>
            </kbd>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm text-zinc-300">Filter stations</span>
            <kbd class="text-xs bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-700">/</kbd>
          </div>
        </div>
      </div>

      <!-- Quick Nav -->
      <div>
        <h3 class="text-sm font-medium text-zinc-400 mb-3">Quick Nav</h3>
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-sm text-zinc-300">Search</span>
            <kbd class="text-xs bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-700">/</kbd>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm text-zinc-300">Now Playing</span>
            <kbd class="text-xs bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-700">P</kbd>
          </div>
        </div>
      </div>
    </div>

    <p class="text-xs text-zinc-600 mt-6 text-center">Press <kbd class="bg-zinc-800 px-1 rounded">?</kbd> to toggle this overlay</p>
  </div>
</div>
```

---

## Acceptance Criteria

### Theme Picker
- [ ] 8 themes available matching TUI themes (pyxis, dracula, catppuccin, gruvbox, nord, rose-pine, tokyonight, system)
- [ ] Theme applies globally via CSS custom properties
- [ ] Selected theme persists in localStorage
- [ ] Theme picker accessible from Settings page
- [ ] Theme picker accessible from command palette
- [ ] Smooth transition between themes (CSS transition on background/text)

### Command Palette
- [ ] Opens with `Cmd+K` (Mac) / `Ctrl+K` (other)
- [ ] Closes with `Esc` or clicking backdrop
- [ ] Fuzzy filter narrows results as user types
- [ ] Arrow keys + Enter navigate and select commands
- [ ] Navigation commands route to correct pages
- [ ] Playback commands interact with PlaybackContext
- [ ] Command palette accessible on mobile via a trigger button

### Help Overlay
- [ ] Opens with `?` key when no text input is focused
- [ ] Closes with `Esc`, `?` again, or clicking backdrop
- [ ] Shows all keyboard shortcuts organized in 4 categories
- [ ] Responsive layout (2 columns desktop, 1 column mobile)
- [ ] `<kbd>` styling for key indicators
