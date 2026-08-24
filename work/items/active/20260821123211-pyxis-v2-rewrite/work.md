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

**M7 and M5 are complete. U18 Sonos is code-complete and deployed; M4 still awaits a
real-speaker acceptance test. M3 still awaits your hands-on validation from a second device.**

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

**M5 is complete and product-validated.** U22 pins albums in candidate-keyed, chunked Cache
Storage with range streaming, cross-tab pin/account fences, LRU pressure, playing-track
retention, fidelity replacement, and crash reconciliation. U23 supplies the installable PWA,
build-bound shell manifest, durable stream authorization, candidate leases, documented worker
API, and generated-schema RPC validation. Worker schema 8 owns pins, media records, pin and
publication generations, and stream epochs.

Automated verification covers complete and interrupted downloads, quota pressure, shared
tracks, fidelity races, account switches, service-worker restart, chunk ranges, shell updates,
malformed RPC responses, cold offline application logic, and the packaged PWA artifact. The
full client suite now has 195 passing tests; contract, production/PWA, Nix package, and flake
gates pass.

Real-browser acceptance used durable device `01M0NXTMN8DKE1F28VJFQZJT0S`. Schema 8 reopened
with 370 cached albums and zero queued writes. The installed app retained the same store. A
10-track A Static Lullaby album reached `ready (10/10)` with 39,294,452 cached bytes. Online
renderer-confirmed playback worked before the app was closed. A first airplane-mode launch
exposed an unbounded navigation wait, fixed in `6b91d92`; repeated reloads then exposed a
transient false zero-album render while Cache Storage reconciliation ran, fixed in `0419f3e`.
After both fixes, the user confirmed a true cold airplane-mode launch, audible pinned playback,
30-second seeking, and transport completion. Reconnection drained all three deferred session
writes to zero. HTTPS health, the 370-album server library, service-worker timeout, candidate
identity, and byte ranges remain live; all three user services are active.

---

**M3 is implemented and deployed.** U5 realtime and U13 console control and handoff are
built, reviewed, and live at `https://pyxis.hummingbird-lake.ts.net`. The last known
correctness gap is fixed in `d4adeb9`: a host now validates and deduplicates a directive,
confirms the browser audio operation, then records public session state. Refused autoplay,
stream/decode failure, storage rollback, load cancellation, and crash recovery are covered
by tests. The deployed worker is now schema 8 after M5.

Second-device acceptance began after M5. It exposed three browser-only readiness defects:
`0749c55` refuses cached remote reachability until a current pull or realtime event confirms
a live socket; `9a2e2ad` applies 370-album and session snapshots under one database lock instead
of reopening ProseQL per row; and `07840bc` lets account/session startup take that lock before
large offline-media reconciliation. All are deployed and covered by the client suite plus the
package gates. The user chose to move on before the final startup-time, transport, disconnect,
and handoff feel-test, so M3 remains implementation-complete but not product-accepted.

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

The eight old review findings were rechecked against current code and targeted tests: header-first
album parsing, malformed payload rejection, failure retryability, invalid duration omission,
pre-U8 descriptors, stale placement ordering, plugin album handlers, and relationship batching
are all present and passing. The session-state counter remains stale because the planned
`se_resolve_residual` tool is not yet exposed by the harness.

**U18 is code-complete, reviewed, packaged, and deployed in `1927ec6`.** The TypeScript Sonos
output plugin provides private-LAN SSDP/seed discovery, authoritative topology, SOAP fault
classification, transport, group volume, grouping convergence, and DIDL metadata. The Rust core
hosts output sessions, routes console commands without a browser, serves candidate-bound media
through a media-only LAN listener, reconciles hardware state in the background, and prevents
cross-account, regrouping, stream-ownership, and persistence races. The reference client can
discover rooms, set groups, create output sessions, queue albums, and control transport.

Fixture/plugin conformance tests, 195 client tests, 64 Rust unit tests and all integration tests,
contract drift, API/PWA verification, owned-source Biome, shellcheck, release build,
`nix build .#pyxis`, `nix build .#plugin-sonos`, and `nix flake check` pass. Repository-wide
Biome still sees only unrelated untracked `prototypes/` failures. The installed profile now runs
commit `1927ec6`; Sonos is a live subprocess, the tailnet health endpoint is 200, and the
media-only listener is active at `http://192.168.1.243:4489` (`/rpc` is 404 there). M4 remains
open only because no real speaker was available for audible transport/grouping acceptance.

Next: implement U19 Soulseek against fixtures; credentials and live-network validation remain
pending. Later, run U18 on real Sonos hardware and finish M3's console/handoff feel-test.

Album removal is no longer deferred. D17 records your decision: server removal wins,
queued local placement intent is discarded, and the client reports the conflict.

Execution order is the `Shipping Milestones` table in `plan.md`, not numeric U-ID order.
Per-unit progress comes from `git log`, not from this file.

Ship only at a milestone boundary.
