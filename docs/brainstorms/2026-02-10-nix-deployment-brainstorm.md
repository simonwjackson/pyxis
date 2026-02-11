# Nix Deployment: Full Module + systemd Support

**Date**: 2026-02-10
**Status**: Brainstorm

## What We're Building

Complete Nix deployment story for Pyxis: audit and fix the existing Home Manager module, add a NixOS system module (`services.pyxis`), and add systemd service definitions (both user and system) so Pyxis runs as a managed daemon.

## Why This Approach

Pyxis is a long-running server (tRPC API + audio streaming). Currently it only runs when manually invoked. For a music server, you want it always available — start on boot, restart on failure, managed secrets, proper state directories.

## Current State (Audit)

### What's Working

- **Nix package**: `buildNpmPackage` produces a working `$out/bin/pyxis` wrapper with bun, yt-dlp, ffmpeg on PATH
- **Home Manager module**: Config generation (`config.yaml`), secret file reading (passwordFile/tokenFile), XDG config placement
- **Hash management**: `just update-hashes` script for npm dependency hash

### Gaps Found

1. **No static file serving in production** — Backend handles `/trpc` and `/stream` but NOT `dist-web/`. In dev, Vite serves the frontend. In production, there's no way to access the UI.

2. **No systemd service** — Neither HM user service nor NixOS system service. Pyxis only runs when you manually invoke the binary.

3. **No NixOS system module** — Only `homeManagerModules.default` exists. No `nixosModules.default` for server deployments.

4. **No `--config` passthrough** — The HM wrapper relies on `env-paths` resolving `XDG_CONFIG_HOME`. This works for HM (which manages `~/.config/`) but will break for system services where there's no conventional home directory.

5. **State directories not declared** — PGlite/SQLite DB lives in `XDG_DATA_HOME/pyxis/db/`, cache in `XDG_CACHE_HOME/pyxis/audio/`, logs in `XDG_STATE_HOME/pyxis/`. System services need explicit `StateDirectory`, `CacheDirectory`.

6. **`web.port` option is misleading in production** — It configures the Vite dev server port, which doesn't run in production. The backend should serve static files itself, making this option irrelevant for deployed instances.

## Key Decisions

### 1. Backend serves static files

Add `dist-web/` serving to the Bun server for non-API routes. Single process, no nginx dependency. This is the simplest deployment model — one binary, one port.

### 2. Both system and user services

- **NixOS module** (`services.pyxis`): System-level service with `DynamicUser`, `StateDirectory`, `CacheDirectory`. For always-on servers.
- **Home Manager module** (`programs.pyxis`): User-level systemd service. For personal machines where pyxis runs in your session.

### 3. DynamicUser for system service

System service uses `DynamicUser=true` for security. State goes to `/var/lib/pyxis/`, cache to `/var/cache/pyxis/`, logs to journal (no file logs needed with systemd).

### 4. XDG env vars for system service

Pass `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`, `XDG_STATE_HOME` explicitly in the systemd unit so `env-paths` resolves to the right directories under `/var/lib/pyxis/` etc.

### 5. Shared config generation

Extract config YAML generation into a shared Nix function so both the HM module and NixOS module use the same logic. Avoid duplication.

## Work Items

### Phase 1: Backend static file serving
- Add `dist-web/` serving to `server/index.ts` for any route not matching `/trpc` or `/stream`
- Serve `index.html` as fallback for SPA routing
- Use `Bun.file()` for static file serving

### Phase 2: Shared Nix infrastructure
- Extract config YAML generation to `nix/lib/mkConfig.nix`
- Extract wrapper script generation to shared function
- Both modules import from shared lib

### Phase 3: NixOS system module
- `nix/modules/nixos.nix` with `services.pyxis` options
- Same option structure as HM module (server.port, sources, etc.)
- systemd service unit:
  - `DynamicUser=true`
  - `StateDirectory=pyxis` → `/var/lib/pyxis/`
  - `CacheDirectory=pyxis` → `/var/cache/pyxis/`
  - `LogsDirectory=pyxis` → `/var/log/pyxis/`
  - `Environment` sets XDG vars to point at these directories
  - `ExecStart` uses `--config /etc/pyxis/config.yaml`
  - `Restart=on-failure`, `RestartSec=5`
  - Hardening: `NoNewPrivileges`, `ProtectSystem=strict`, `PrivateTmp`

### Phase 4: HM user service
- Add `systemd.user.services.pyxis` to existing HM module
- `ExecStart` = wrapped pyxis binary
- `Restart=on-failure`
- `WantedBy=default.target` (starts with user session)
- Optional: `programs.pyxis.service.enable` to toggle auto-start

### Phase 5: Flake exports
- Add `nixosModules.default` pointing to NixOS module
- Verify existing `homeManagerModules.default` still works
- Test both paths

## Open Questions

1. **Should `web.port` and `web.allowedHosts` be removed from production config?** — If the backend serves static files, there's no separate Vite process. These options only matter in development.

2. **Should the `--config` flag be used explicitly in both modules?** — Currently HM relies on XDG convention. Explicit `--config` is more robust.

3. **Log handling in systemd** — Should pino log to files (current behavior) or stdout (let journald capture)? Systemd convention is stdout, but file logs exist for dev. Could use an env var to toggle.

4. **OpenFirewall option?** — Should the NixOS module include `networking.firewall.allowedTCPPorts` option?
