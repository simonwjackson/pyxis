---
id: 20260821123211-pyxis-v2-rewrite
title: "Pyxis v2: account-scoped music service with plugin sources and offline clients"
type: feat
status: active
created: 2026-08-21
parent: none
---

# Pyxis v2 rewrite

Big-bang ground-up rewrite. No v1 compatibility.

## Artifacts

- `plan.md` — the authoritative plan. Read it in full before working.

## Origin

Shaped through conversation on 2026-08-21. There is no upstream requirements document;
requirements and decisions were captured directly into `plan.md` sections
`Requirements` and `Decision Log`.

## Current position

**M7's documentation and the first half of M5 are done. M3 still awaits your hands-on
validation from a second device.**

U26 documents the whole public API, with a worked example that `tools/verify-api-example`
extracts from the document and runs, so a claim that stops matching the server fails there.

U20 and U21 build the offline data plane: a ProseQL WASM store in a worker, and two-way
sync with an offline write queue and explicit conflict outcomes. Both are unit-verified and
the assets are served correctly over the tailnet.

**The one thing nobody has verified: the WASM engine has never run in a real browser.** The
binary loads and initialises under Bun, and the worker chunk and `.wasm` are served with
the right content types, but IndexedDB persistence has only been exercised against an
in-memory engine. Open the client, check the Local store panel, and confirm it says
`opened` after a reload rather than `created`. If it says `created` every time, or
`Keeps data after close: false`, the browser path is broken and U22 should not be built on
top of it.

U22 offline downloads and U23 service worker are not started.

---

**M3 is implemented and deployed.** U5 realtime and U13 console control and handoff are built, reviewed, and live at
`https://pyxis.hummingbird-lake.ts.net`. A WebSocket check confirmed the TLS edge upgrades
correctly and that session state fans out. What remains is the milestone's actual question,
which only you can answer: does console mode feel good.

**Milestone M2 is complete and live on the tailnet.** The live 386-entry legacy manifest is
fully accounted: 370 albums are in Discovery, 16 remain unresolved after manual review,
and no import request failed. The durable audit is
`docs/operations/2026-08-21-v1-album-import.md`.

Commit `18a5cce` is installed through `nix profile`. The `pyxis.service`,
`pyxis-tsnet.service`, and `pyxis-ytdlp-update.timer` user units are active. HTTPS, health,
system status, and the full 370-album library were verified through
`https://pyxis.hummingbird-lake.ts.net`.

The old system `pyxis.service` and `tsnet-proxy-pyxis.service` units are stopped. They
remain declared by the current NixOS generation and can return after a reboot or system
switch until the prepared `mountainous` removal is deployed.

Next: your M3 console validation and the browser check above, then **U22** offline
downloads and **U23** service worker. U18 Sonos and U19 Soulseek need hardware and an
account.

One decision is deferred and should be made before U23: the `Sync domains` table does not
say what happens when an album is removed on another device. Pull currently leaves the
local copy in place rather than guessing.

Execution order is the `Shipping Milestones` table in `plan.md`, not numeric U-ID order.
Per-unit progress comes from `git log`, not from this file.

Ship only at a milestone boundary.
