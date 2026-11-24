# Pyxis

An account-scoped music service. The core owns identity, library, playback sessions,
and sync. Every music provider is a third-party plugin. Clients are offline-first.

This branch is a ground-up v2 rewrite. It shares no code with v1.

## Production and development

Production runs on **unzen** through mountainous `serviceApps.pyxis`, following the
`service-apps-unzen` branch.

Pyxis ships a service, not a web player. For local development, start the core with
`just dev` (core plus the YouTube Music plugin) or `just dev-core` in the dev shell. Check
`http://127.0.0.1:4488/healthz`; `/` returns 404 without a web root.

Third-party clients use the [public API](docs/api/README.md). Browser hosts can reuse the
[worker data plane](clients/app/src/worker/README.md), RPC client, PWA helpers and
renderer-confirmed playback in `clients/app/src/`. Hosts supply their own UI and shell.
To use `pwa/service-worker.ts`, the host must build it as `/service-worker.js` and embed
its own shell asset list in the `__PYXIS_ASSET_MANIFEST__` JSON string at build time.

Read [`work/items/active/20260821123211-pyxis-v2-rewrite/plan.md`](work/items/active/20260821123211-pyxis-v2-rewrite/plan.md).

## Development checks

```sh
nix develop
bun install --frozen-lockfile
just test-app-related src/playback/confirmed-host.test.ts
just verify
```

Focused test paths are relative to `clients/app`. A focused run does not replace `just verify`.

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
Third-party clients
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

See [`docs/install.md`](docs/install.md) for production and development setup, core
configuration, and plugin configuration.
