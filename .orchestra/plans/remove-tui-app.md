# Remove TUI App

## Goal

Remove the Ink-based terminal UI application from the codebase. The web app has achieved feature parity and surpassed the TUI — the TUI is no longer needed. This removes ~70 files and 3 dependencies.

---

## Requirements

- Delete the entire `src/tui/` directory (71 files)
- Delete the CLI command registration for `tui` (`src/cli/commands/tui/`)
- Remove TUI references from CLI entry points
- Remove TUI-only npm dependencies (`ink`, `@inkjs/ui`, `ink-testing-library`, `react-devtools-core`)
- Ensure CLI still works for all other commands (auth, stations, search, etc.)
- Ensure web app is unaffected

---

## Source Files

### Delete entirely

| Path | Contents |
|------|----------|
| `src/tui/` | Entire TUI app (71 files): components, hooks, theme, utils |
| `src/cli/commands/tui/` | TUI command registration (1 file: `index.ts`) |

### Edit

| File | Change |
|------|--------|
| `src/cli/commands/index.ts:9` | Remove `export { registerTuiCommand } from "./tui/index.js";` |
| `src/cli/index.ts:17` | Remove `registerTuiCommand` from the import statement |
| `src/cli/index.ts:96` | Remove `registerTuiCommand(program);` call |
| `package.json` | Remove dependencies: `ink`, `@inkjs/ui`, `ink-testing-library`, `react-devtools-core` |

### Post-edit

| Command | Purpose |
|---------|---------|
| `bun install` | Regenerate lockfile after dependency removal |
| `bun run typecheck` | Verify no broken imports remain |
| `bun test` | Verify remaining tests pass |

---

## Acceptance Criteria

- [ ] `src/tui/` directory no longer exists
- [ ] `src/cli/commands/tui/` directory no longer exists
- [ ] `pyxis --help` no longer shows `tui` command
- [ ] `bun run typecheck` passes with no errors
- [ ] `bun test` passes (remaining non-TUI tests)
- [ ] `ink`, `@inkjs/ui`, `ink-testing-library`, `react-devtools-core` no longer in `package.json`
- [ ] All other CLI commands still work (`pyxis auth`, `pyxis stations`, etc.)
- [ ] Web app builds and runs normally (`bun run build:web`)
