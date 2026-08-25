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

**M7, M5, and M4 are complete. M6/U19 Soulseek is implementation-complete and deployed;
credentialed live-network acceptance remains open. M3 still awaits your hands-on validation
from a second device.**

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

**M4/U18 is complete and product-accepted on real Sonos hardware.** The TypeScript output plugin
provides private-LAN SSDP plus mDNS discovery, authoritative topology, SOAP fault classification,
transport, group volume, grouping convergence, stream profiles, and DIDL metadata. The Rust core
hosts output sessions, routes console commands without a browser, serves candidate-bound media
through a media-only LAN listener, reconciles hardware state in the background, and prevents
cross-account, regrouping, stream-ownership, format, cache, and persistence races. The reference
client discovers rooms, sets groups, creates output sessions, queues and clears albums, and
controls transport.

Real-network testing exposed two deployment defects after `1927ec6`: SSDP replies were suppressed
while `_sonos._tcp` mDNS remained available, fixed in `a3588f2`; and YouTube Music's WebM/Opus
stream was rejected with Sonos UPnP 714. `bc1f1d1` lets outputs declare ordered formats and binds
the selected M4A format through source resolution, stream tickets, retries, MIME metadata, and
cache identity. The host firewall also blocked port 4489, so the media-only listener now uses the
already-allowed `http://192.168.1.243:9000`; its `/rpc` route is 404 as required. A direct
low-volume MP3 and M4A probe played on Living Room, WebM reproduced 714, and the user then
confirmed library playback works. `b178dd2` added the missing output-session queue-clear action.

Fixture/plugin conformance tests, 196 client tests, 64 Rust unit tests and all integration tests,
contract drift, API/PWA verification, owned-source Biome, shellcheck, release build, exact-commit
Nix package builds, and `nix flake check` pass. Local and tailnet health remain 200. Repository-wide
Biome still sees only unrelated `prototypes/` work.

**U19 is fixture-complete, reviewed, packaged, and deployed in `d6cf5fb` plus Nix fix
`9da7340`.** The provider-only Soulseek plugin is absent from public plugin lists and system
status, exposes only opaque search/download operations, accepts no shared-folder configuration,
and pins `soulseek-ts` 2.1.4 with a reproducible patch that advertises zero shares, bounds hostile
frames and compressed results, and drops malformed peers. Account switches close prior clients;
peer queues can wait up to six hours; failures invalidate the client and enter durable backoff.

The core creates account-scoped fidelity jobs, processes at most one due library track per minute,
accepts only the existing matcher's AutoMerge band, binds searched and downloaded byte counts,
probes complete files with packaged `ffprobe`, reruns duration matching, allows only playback-safe
formats and strict quality improvements, and imports through the existing local media store.
Staging is exact-path and partial-safe, satisfied jobs revalidate weekly, active playback media is
retained during eviction, and a strict 50 GiB per-account acquisition budget gates imports.
Long provider calls are cooperatively cancelled during shutdown.

Verification passes with 71 TypeScript plugin/SDK tests, 196 client tests, 68 Rust unit tests and
all integration tests, including verified-lossless resolution, rejected/ambiguous/no-partial
paths, provider invisibility, hostile-call cancellation, exact-commit Soulseek and aggregate Nix
builds, and `nix flake check`. The deployed provider process is live while public status remains
three visible plugins with only `source` and `output`; local and tailnet health are 200. With no
Soulseek credentials configured, the scheduler is correctly idle. M6 product acceptance still
requires credentials and a live peer download that becomes the preferred local candidate.

Next: obtain/configure Soulseek credentials and run M6 live-network acceptance. Later, finish
M3's console/handoff feel-test.

Album removal is no longer deferred. D17 records your decision: server removal wins,
queued local placement intent is discarded, and the client reports the conflict.

Execution order is the `Shipping Milestones` table in `plan.md`, not numeric U-ID order.
Per-unit progress comes from `git log`, not from this file.

Ship only at a milestone boundary.
