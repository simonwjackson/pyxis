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
sync with an offline write queue and explicit conflict outcomes.

**U20's real browser path is verified.** On 2026-08-22 the deployed browser reported
`opened`, `Keeps data after close: true`, schema version 2, and the same durable device id
after reload. That test proved WASM plus IndexedDB, not only the in-memory engine.

The same screen exposed that U21 was not connected to the reference client: it reported
zero cached albums because the page never called worker sync. U21 is now connected across
albums, listens, and device-hosted session commands. The fix also moved the worker schema
to version 6, added durable command receipts and sync notices, and made server album
removal win with an explicit conflict under D17.

**U21 is deployed and product-validated.** On 2026-08-22 the browser reopened schema 6
with IndexedDB persistence enabled, device id `01M0NXTMN8DKE1F28VJFQZJT0S`, all 370 albums
cached, and zero deferred writes. The M3 renderer correction later moved the worker to
schema 7, adding exact optimistic-result fingerprints for interrupted command recovery.
The core, worker JavaScript, and WASM content types remain verified.

**U22 and U23 are implemented and review-complete.** Pinned albums use candidate-keyed,
chunked Cache Storage with range streaming, cross-tab pin/account fences, LRU pressure,
playing-track retention, fidelity replacement, and crash reconciliation. The installable
PWA shell carries a build-bound asset manifest, network-first navigation fallback, durable
stream authorization, candidate leases, and generated-schema RPC validation. Worker schema
8 adds pins, media records, pin generations, publication generations, and stream epochs.

Automated verification covers cold offline application logic, complete and interrupted
downloads, quota pressure, shared tracks, fidelity races, account switches, service-worker
restart, chunk ranges, shell updates, malformed RPC responses, and the packaged PWA artifact.

**M5 is deployed at `9254bd4` and awaits only real-browser acceptance.** HTTPS serves the
manifest, build-bound asset manifest, icon, service worker, worker/WASM chunks, and hashed
application bundle with correct content types. The live library still has 370 albums. A
live one-byte stream probe returned candidate identity and a valid content range. The three
user services remain active and health is 200.

---

**M3 is implemented and deployed.** U5 realtime and U13 console control and handoff are
built, reviewed, and live at `https://pyxis.hummingbird-lake.ts.net`. The last known
correctness gap is fixed in `d4adeb9`: a host now validates and deduplicates a directive,
confirms the browser audio operation, then records public session state. Refused autoplay,
stream/decode failure, storage rollback, load cancellation, and crash recovery are covered
by tests. The deployed worker now migrates from schema 6 to 7.

What remains is hands-on acceptance from a second device: does console mode feel good. A
reload on the host should first confirm schema 7 before that test.

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

Next: perform the combined real-browser gate for M3 and M5: schema 8 migration, PWA
installation, a pinned album, cold offline boot/playback, seeking, reconnect reconciliation,
and second-device console control. U18 Sonos and U19 Soulseek still need hardware and an
account.

Album removal is no longer deferred. D17 records your decision: server removal wins,
queued local placement intent is discarded, and the client reports the conflict.

Execution order is the `Shipping Milestones` table in `plan.md`, not numeric U-ID order.
Per-unit progress comes from `git log`, not from this file.

Ship only at a milestone boundary.
