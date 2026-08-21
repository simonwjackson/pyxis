# Pyxis

An account-scoped music service. The core owns identity, library, playback sessions,
and sync. Every music provider is a third-party plugin. Clients are offline-first.

This branch is a ground-up v2 rewrite. It shares no code with v1.

## Status

Pre-implementation. The plan is the only artifact.

Read [`work/items/active/20260821123211-pyxis-v2-rewrite/plan.md`](work/items/active/20260821123211-pyxis-v2-rewrite/plan.md).

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

Not yet installable. Packaging lands in U25.
