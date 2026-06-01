# Code Context
## Files Retrieved
1. `AGENTS.md` (lines 25-75, 77-107) - architecture, TypeScript, debugging/logging conventions.
2. `README.md` (lines 1-12, 63-98) - product shape, commands, Android kiosk MVP.
3. `VISION.md` (lines 1-21, 23-83, 110-151, 171-252) - product strategy artifact.
4. `.` top-level dirs via `ls` and `find -maxdepth 2` - repository shape.
## Key Code
N/A: shallow strategy/layout scan only; no code entrypoint read.
## Architecture
TypeScript/Bun daemon + React/Vite/TanStack Router web UI; tRPC API, stream proxy, WebSocket support.
Source layer normalizes backends; current core sources Pandora + YTMusic, broader source stubs/ambitions in docs.
Top-level layout: `server/`, `src/web/`, `src/sources/`, `src/db/`, `android/`, `docs/`, `nix/`, `plugins/`, `openspec/`, `public/`.
Android is debug-only native WebView kiosk shell for Sony NW-A306, currently pointed at local Pyxis server.
Patterns: strict TS; Nix/Bun/Just; pino structured logs; read runtime logs before bug source dives.
Config: YAML plus env overrides; secrets stay in env, not config/db.
Product strategy: no `STRATEGY.md` found; `VISION.md` is the strategy artifact.
Pyxis is a personal music system, not just player; daemon is single source of truth across devices.
Albums are the unit; explicit capture enters Discovery, triage goes to Collection/Archive/Dismissed, Hot comes from listening history.
Future pillars: journal, Weekly Mix, cross-source identity, enrichment, caching/always-proxy playback, lean-back mode.
Pain point: docs drift (AGENTS split dev commands vs README/package unified `bun run dev`/`just dev`).
Pain point: kiosk has hardcoded local IP/debug-only shell; needs durable device/server config and product-grade kiosk UX.
Gap: many strategic concepts are specified, but likely need end-to-end vertical slices from daemon state to kiosk/mobile UI.
Leverage: make kiosk a lean-back/capture appliance: station playback, add/capture to Discovery, queue/playback state, logs.
Leverage: start with album placement/listening journal contracts; they unlock Discovery, Hot, caching, Weekly Mix, richer UI.
## Start Here
`VISION.md`, then README Android MVP lines, then `server/`, `src/sources/`, and `src/web/` for the first implementation slice.
## Supervisor coordination
Not blocked; no supervisor decision needed.
