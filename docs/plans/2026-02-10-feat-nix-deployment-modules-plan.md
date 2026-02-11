---
title: "feat: Add NixOS module, systemd services, and production static file serving"
type: feat
date: 2026-02-10
brainstorm: docs/brainstorms/2026-02-10-nix-deployment-brainstorm.md
---

# feat: Add NixOS module, systemd services, and production static file serving

## Overview

Complete the Nix deployment story for Pyxis: add static file serving to the backend so it can serve the web UI in production, create a NixOS system module (`services.pyxis`) with a hardened systemd service, add a systemd user service to the existing Home Manager module, and extract shared config generation to avoid duplication.

## Problem Statement

Pyxis has a working Nix package and Home Manager module, but:

1. **No web UI in production** — The backend only handles `/trpc/*` and `/stream/*`. The built frontend (`dist-web/`) is included in the package but nothing serves it. Production users get 404 for `/`.
2. **No daemon support** — Pyxis only runs when manually invoked. No auto-start, no restart on failure, no service management.
3. **No NixOS module** — Only Home Manager is supported. Server deployments need `services.pyxis`.
4. **Duplicated config logic** — Adding a NixOS module means duplicating YAML generation and wrapper scripts.

## Technical Approach

### Architecture

```
flake.nix
├── packages.default          (existing — unchanged)
├── homeManagerModules.default → nix/modules/home-manager.nix
│   └── imports nix/lib/shared.nix
├── nixosModules.default      → nix/modules/nixos.nix      (NEW)
│   └── imports nix/lib/shared.nix
└── nix/lib/shared.nix        (NEW — config gen, wrapper)
```

```
server/index.ts
├── /trpc/*     → tRPC handler     (existing)
├── /stream/*   → audio proxy      (existing)
└── /*          → static files     (NEW — serves dist-web/)
```

### Implementation Phases

#### Phase 1: Backend static file serving

**File: `server/index.ts`**

Add a static file handler after the existing `/trpc` and `/stream` routes. Before the final `404 Not Found` response:

```typescript
// Static file serving (production)
const DIST_DIR = join(import.meta.dirname, "../dist-web");

// Check if dist-web exists (production build present)
const hasDistWeb = existsSync(DIST_DIR);

// In the fetch handler, after /trpc block:
if (hasDistWeb) {
  // Try to serve the exact file
  const filePath = join(DIST_DIR, url.pathname);
  const file = Bun.file(filePath);
  if (await file.exists()) {
    return new Response(file);
  }
  // SPA fallback: serve index.html for all non-file routes
  return new Response(Bun.file(join(DIST_DIR, "index.html")));
}

return new Response("Not Found", { status: 404 });
```

Key behaviors:
- Only activates when `dist-web/` exists (no-op in development where Vite serves)
- Exact file match first (for JS/CSS/images with hashed filenames)
- SPA fallback to `index.html` for client-side routing
- `Bun.file()` handles MIME types and streaming automatically
- Security: `join()` normalizes paths — `Bun.file()` only serves files that exist, and the path is rooted at `DIST_DIR`

CORS adjustment: When backend serves static files, frontend and backend share the same origin. Update CORS logic so same-origin requests don't need explicit headers. Keep existing CORS for development mode (separate Vite port).

```typescript
// Production: frontend is same-origin, no CORS needed
// Development: frontend is on different port, needs CORS
const corsOrigin = hasDistWeb
  ? `http://${config.server.hostname}:${config.server.port}`
  : `http://${config.server.hostname}:${config.web.port}`;
```

#### Phase 2: Shared Nix infrastructure

**File: `nix/lib/shared.nix`**

Extract reusable functions that both modules use:

```nix
{ lib, pkgs }: {
  # Option definitions shared between HM and NixOS modules
  mkPyxisOptions = { ... };

  # Generate config.yaml derivation from resolved options
  mkConfigYaml = cfg: pkgs.writeText "pyxis-config.yaml" ( ... );

  # Generate wrapper script that reads secrets and execs pyxis
  mkWrapper = { cfg, configPath }: pkgs.writeShellScriptBin "pyxis" ''
    set -euo pipefail
    # Read password file if configured
    ${lib.optionalString (cfg.sources.pandora.passwordFile != null) ''
      if [[ -f "${cfg.sources.pandora.passwordFile}" ]]; then
        export PYXIS_PANDORA_PASSWORD="$(cat "${cfg.sources.pandora.passwordFile}")"
      else
        echo "Warning: Pandora password file not found" >&2
      fi
    ''}
    # ... discogs token ...
    exec ${cfg.package}/bin/pyxis --config ${configPath} "$@"
  '';
}
```

Changes from current HM module:
- **Explicit `--config` flag** instead of relying on XDG convention
- **Warning instead of hard exit** when password file is missing (service can still start for YouTube-only use)
- Both modules import this, eliminating duplication

#### Phase 3: NixOS system module

**File: `nix/modules/nixos.nix`**

```nix
{ config, lib, pkgs, ... }:
let
  cfg = config.services.pyxis;
  shared = import ../lib/shared.nix { inherit lib pkgs; };
  configYaml = shared.mkConfigYaml cfg;
  wrappedPyxis = shared.mkWrapper {
    inherit cfg;
    configPath = "/etc/pyxis/config.yaml";
  };
in {
  options.services.pyxis = {
    enable = lib.mkEnableOption "Pyxis music streaming server";
    # ... shared options (package, server, web, sources, log) ...
    openFirewall = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = "Open firewall port for the Pyxis server";
    };
  };

  config = lib.mkIf cfg.enable {
    # Config file at /etc/pyxis/config.yaml
    environment.etc."pyxis/config.yaml".source = configYaml;

    # Firewall
    networking.firewall.allowedTCPPorts =
      lib.mkIf cfg.openFirewall [ cfg.server.port ];

    # systemd service
    systemd.services.pyxis = {
      description = "Pyxis music streaming server";
      after = [ "network-online.target" ];
      wants = [ "network-online.target" ];
      wantedBy = [ "multi-user.target" ];

      serviceConfig = {
        ExecStart = "${wrappedPyxis}/bin/pyxis";
        Restart = "on-failure";
        RestartSec = "5s";

        # DynamicUser — no persistent system user
        DynamicUser = true;
        StateDirectory = "pyxis";
        CacheDirectory = "pyxis";
        LogsDirectory = "pyxis";

        # Map XDG dirs to systemd-managed paths
        Environment = [
          "XDG_DATA_HOME=/var/lib/pyxis"
          "XDG_CACHE_HOME=/var/cache/pyxis"
          "XDG_STATE_HOME=/var/log/pyxis"
          "HOME=/var/lib/pyxis"
        ];

        # Hardening
        NoNewPrivileges = true;
        ProtectSystem = "strict";
        ProtectHome = true;
        PrivateTmp = true;
        PrivateDevices = true;
        ProtectKernelTunables = true;
        ProtectControlGroups = true;
        RestrictAddressFamilies = [ "AF_INET" "AF_INET6" "AF_UNIX" ];
        RestrictNamespaces = true;
        LockPersonality = true;
        MemoryDenyWriteExecute = false; # Bun JIT needs this
        RestrictRealtime = true;
      };
    };
  };
}
```

Key decisions:
- **Config at `/etc/pyxis/config.yaml`** via `environment.etc` — standard NixOS convention, readable, admin-friendly
- **XDG env vars** point to systemd-managed directories: data → `/var/lib/pyxis`, cache → `/var/cache/pyxis`, state/logs → `/var/log/pyxis`
- **`HOME=/var/lib/pyxis`** as fallback for any code that reads `$HOME`
- **`MemoryDenyWriteExecute = false`** because Bun's JIT compiler needs W+X memory
- **`network-online.target`** dependency since Pandora/YouTube need network
- Missing password file logs a warning but doesn't prevent startup

#### Phase 4: Home Manager user service

**File: `nix/modules/home-manager.nix`** (update existing)

Add a systemd user service alongside the existing config and wrapper:

```nix
config = lib.mkIf cfg.enable {
  home.packages = [ wrappedPyxis ];
  xdg.configFile."pyxis/config.yaml".source = configYaml;

  # NEW: systemd user service
  systemd.user.services.pyxis = {
    Unit = {
      Description = "Pyxis music streaming server";
      After = [ "network-online.target" ];
    };
    Service = {
      ExecStart = "${wrappedPyxis}/bin/pyxis";
      Restart = "on-failure";
      RestartSec = "5s";
    };
    Install = {
      WantedBy = [ "default.target" ];
    };
  };
};
```

User service relies on standard XDG paths (already correct for Home Manager). Starts automatically with the user session via `default.target`.

#### Phase 5: Flake exports and cleanup

**File: `flake.nix`**

```nix
# Add NixOS module export (after line 94)
nixosModules.default = ./nix/modules/nixos.nix;
```

**Refactor `home-manager.nix`** to use shared lib instead of inline config generation.

## Acceptance Criteria

### Functional Requirements

- [x] `http://host:8765/` serves the React SPA in production (static files from dist-web/)
- [x] SPA client-side routing works (e.g., `/search`, `/history` all serve index.html)
- [x] `/trpc/*` and `/stream/*` routes continue working unchanged
- [x] Static file serving is a no-op in development (when dist-web/ doesn't exist)
- [x] NixOS module: `services.pyxis.enable = true` starts a systemd service on boot
- [x] NixOS module: service restarts automatically on failure
- [x] NixOS module: DynamicUser creates state at `/var/lib/pyxis/`, cache at `/var/cache/pyxis/`
- [x] NixOS module: secrets read from files at runtime, not in Nix store
- [x] Home Manager module: `programs.pyxis.enable = true` creates a systemd user service
- [x] Home Manager module: user service starts with login session
- [x] Both modules: `--config` flag explicitly passed to binary
- [x] Both modules: generate identical YAML config format from shared code

### Non-Functional Requirements

- [x] NixOS service runs with systemd hardening (NoNewPrivileges, ProtectSystem, etc.)
- [x] No secrets stored in Nix store or config files
- [x] `nix build` still works (package unchanged)
- [x] `bun run dev:server` still works in development (no regression)

## Dependencies & Risks

**Dependencies:**
- Phase 2-4 depend on Phase 1 (static file serving needed for production to work)
- Phase 3-4 depend on Phase 2 (shared lib needed before creating/updating modules)

**Risks:**
- `MemoryDenyWriteExecute = false` weakens security hardening — required by Bun's JIT, unavoidable
- `env-paths` behavior with custom XDG vars needs testing — should work per spec, but verify
- CORS changes could break development workflow if not careful — check for dev/production mode

## References & Research

### Internal References
- Existing HM module: `nix/modules/home-manager.nix`
- Flake: `flake.nix:41-75` (package definition)
- Server entry: `server/index.ts` (route handling)
- Config resolution: `src/config.ts:162` (resolveConfig with --config support)
- Database: `src/db/index.ts:18-20` (XDG_DATA_HOME/pyxis/db/)
- Cache: `server/services/stream.ts:31` (XDG_CACHE_HOME/pyxis/audio/)
- Logger: `src/logger.ts:14-15` (XDG_STATE_HOME/pyxis/)

### Brainstorm
- `docs/brainstorms/2026-02-10-nix-deployment-brainstorm.md`
