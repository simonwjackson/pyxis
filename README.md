# Pyxis

An account-scoped music service. The core owns identity, library, playback sessions,
and sync. Every music provider is a third-party plugin. Clients are offline-first.

This branch is a ground-up v2 rewrite. It shares no code with v1.

## Status

**M1 — A song plays — is ready for product validation.**

```sh
just dev
```

Open <http://127.0.0.1:5173>. The page is intentionally unstyled. Search YouTube Music,
add a result to the queue, then press Play. It claims the `default` account, discovers the
plugin, creates a device-hosted session, resolves and caches audio, and plays through the
browser.

M2 restores the 371-album library and installs the product on the tailnet.

Read [`work/items/active/20260821123211-pyxis-v2-rewrite/plan.md`](work/items/active/20260821123211-pyxis-v2-rewrite/plan.md).

## Focused daytime tests

Inside the project dev shell, run these from the repository root. Each path is relative
to the named client package, not the repository root:

```sh
just test-app-related src/worker/offline-policy.ts
just test-player-related src/model/playback.ts
# Explicit test files also select themselves.
just test-app-related src/playback/confirmed-host.test.ts
just test-player-related src/model/playback.test.tsx
```

These recipes use Vitest's existing `related --run` selection. They are not full verification,
typechecking, lint, architecture checks, or builds. Missing selections fail instead of passing
with zero tests. Static imports can select many tests; dynamic imports and other dependencies
may not be covered. Use broader tests when the affected scope is unknown.

The clients have separate test configurations. For a shared app playback change, run both:

```sh
just test-app-related src/playback/confirmed-host.ts
just test-player-related ../app/src/playback/confirmed-host.ts
```

Keep `just verify` as the repository gate; focused selection does not replace it or the
separate player checks.

## The v1 codebase

The entire v1 history lives on the `legacy` branch, unchanged.

```sh
git log legacy              # v1 history
git show legacy:src/...     # read a v1 file
```

Nothing on this branch descends from `legacy`. v2 carries no v1 data formats,
id formats, wire shapes, or compatibility paths. Protocol knowledge (the Pandora
handshake, Sonos SOAP envelopes) is reimplemented in v2 plugins, which is reuse of
third-party protocol facts, not reuse of v1 Pyxis.

## Shape

```
Clients (PWA, third-party apps)
    │  RPC over HTTP + WebSocket realtime + plain HTTP for media bytes
    ▼
Core service (Rust)  ── owns accounts, library, sessions, sync, media store
    │  plugin protocol over stdio
    ▼
Plugins (TypeScript, separately installed)
    pandora · ytmusic · sonos · soulseek
```

The core runs and serves with zero plugins installed.

## Install

The aggregate profile package now builds:

```sh
nix profile add .#pyxis
```

Do not enable its user units until the old NixOS `pyxis.service` and
`tsnet-proxy-pyxis.service` are inactive. See [`docs/install.md`](docs/install.md) for the
verified handoff, state paths, user units, upgrades, and rollback boundary.
