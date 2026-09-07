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

**M1, M2, M5, M6, and M7 are complete. M4 was accepted previously; the new Sonos failure
report requires diagnosis and revalidation. Bidirectional Play/Pause/Stop and current
responsiveness are accepted. The user resolved the handoff report by identifying the wrong
initiating device. M3 retains physical autoplay/background/reconnect checks.**

**The session-command acknowledgement race is corrected locally, not deployed.** A command
queued while an earlier command is acknowledged now stays visible instead of disappearing
until the next sync. `WorkerDatabase.applySessionVerdict` reads still-queued commands and
replaces the session in one account-fenced operation, and `putServerSession` is deleted so
no bare `replaceSession` remains on the verdict path. This is the session analogue of the
album fix in `cac84b0`. The client suite is 267 passing, up from 261; plugin/SDK, Rust,
typecheck, contract, owned lint, and PWA build all pass. `just verify` still stops at the
inherited 29 prototype lint errors and 17 warnings, matching a clean baseline at `72a1f90`.
This closes follow-up `01M1Y7QS1QWPHXN5JY8P14RXRT`. It makes no physical playback claim, and
radio or automatic queue refill remain unbuilt and still depend on it. See
`docs/operations/2026-09-07-session-ack-race.md`.

**First/full-library startup is corrected and deployed in `dcf702e`.** The same 370-album
Chromium startup measured 2.542 seconds, down from 82.857 seconds. Warm reload measured
1.700 seconds and retained all albums and the same identity. A separate profiled fresh run
confirmed one library-file write instead of 370. Eight added real-WASM regressions cover
fresh and full-update batches, queued/newer records, durable acknowledgement, and partial-save
recovery. The combined tree passes 261 client and 84 plugin/SDK tests, with two private-fixture
skips, scoped checks, exact Nix build, and host flake check. `just verify` retains 29 prototype
errors plus three errors from an auto-loaded skill checkout, and 17 warnings. Independent
change/integration reviews found no blocker. See `docs/operations/2026-09-07-full-library-startup.md`.
This closes performance follow-up `01M1VZ456T3R9EWQ1367WAFTWY` for the measured library, not
physical-device M3 acceptance or severe-I/O-pressure behavior. No Sonos commands were issued.

The 2026-09-06 autonomous pass fixed two more realtime lifecycle races in `ecbb285`, with
seven regression cases and a successful independent follow-up review. `423ce52` then fixed
complete worker snapshots retaining omitted playback fields, with three real-WASM regression
cases and another successful independent review. See
`docs/operations/2026-09-06-m3-reconnect-validation.md` for deployment, browser evidence,
verification exceptions, and the remaining acceptance checklist.

Normal/incognito manual testing then failed responsiveness acceptance. Isolated diagnostics
led to `6855cf0` (atomic session events with delayed-acknowledgement recovery), `578f11b`
(session-only command synchronization), and `12e422e` (prevent automatic audio restart during
Stop/source-reset persistence). Each was independently reviewed and deployed by exact revision.
Final tests: 232 client and 71 plugin/SDK; typecheck, owned-source lint, PWA/Nix builds and host
flake checks pass. `just verify` still stops at unrelated prototype lint (25 errors/16 warnings).

Renderer effects improved to 335–455 ms when idle, but subsequent back-to-back Play/Pause still
measured 1467–2930 ms. These are muted diagnostic measurements, not acceptable-feel claims.
The Stop restart blip no longer appeared, and the final two-browser functional smoke passed.
A later two-host timing run coincided with heavy disk-I/O pressure and measured up to 14459 ms
for a renderer effect and 22615 ms for core/UI convergence; that bad result is retained in the
report, not dismissed as noise. Repeating with sampled I/O and memory pressure at zero gave
488–1488 ms renderer effects in both directions. Diagnostics are now stopped/unreachable,
services healthy, and the 370-album library intact. Full-library first sync remains slow and
unmodified. M3 remains open for responsiveness, audibility, and physical-device behavior.

The user's next retest still reported 2–3 seconds. `d126106` then removed eight incidental
collection writes from every ProseQL reopen while retaining all locks, full collection loads,
and durable mutation flushes. It also rejects internal worker-memory fallbacks that would be
discarded on the next lock, preserving page-owned startup fallback and runtime rejection.
Independent reviews and 237 client plus 71 plugin tests pass with explicit Node 22. The final
production two-browser smoke measured 352–695 ms renderer effects and 1008–1348 ms core/UI
convergence, with successful transport, both handoffs, network refusal/recovery, and reload.
Diagnostics are stopped/unreachable and services/library are healthy. See
`docs/operations/2026-09-06-m3-read-only-reopens.md` for the exact deployment, pressure samples,
verification limits, and remaining user acceptance. Fresh full-library sync was not remeasured
in this follow-up.

After this deployment, the user accepted the current responsiveness: **“Acceptable for now.”**
This closes the immediate latency retest provisionally, not the remaining physical-device
M3 checks or the outstanding first/full-library startup work. Do not resume latency tuning
without a regression or a renewed request.

The user then confirmed Play/Pause/Stop both directions, but reported handoff and Sonos not
working. `a54ec1a` fixes a reproduced browser handoff source restart and adds cleared-state
teardown when the Stop directive is absent. Review caught and verified the latter requirement.
241 client plus 71 plugin tests and scoped production/Nix gates pass. The final guarded browser
smoke passed stopped and playing handoff both ways, transport, cut/refusal/recovery, and reload.
Sonos remains unresolved: read-only Kitchen position queries sometimes time out under Bun;
output handoff is explicitly unsupported despite being offered in the reference UI.

This pass also exposed two harness incidents: the old temporary A profile lost its expected
store/identity, and an unscoped Clear queue selector sent one unintended Sonos request that
failed (Kitchen retained all 42 tracks). The user was informed. New helpers scope selectors
and reject non-diagnostic page RPCs before delivery, with negative probes. Final validation
used a new durable diagnostic outside /tmp; first full-library startup still took 83.621 seconds.
All diagnostics are stopped/unreachable. Details, exact scope and exceptions are in
`docs/operations/2026-09-06-m3-handoff-sonos-follow-up.md`.

The next browser-only retry still moved nothing and showed no error. The target's server
revision stayed unchanged. A real Chromium reproduction then found that realtime replacement
could reorder Other devices between mouse-down and mouse-up, silently cancelling the click.
`560b530` orders a copied view array by immutable session ID. The native repro changes from a
21-pixel jump/zero callbacks to a stationary button/one correct handoff. Independent review,
242 client/71 plugin tests, and scoped build/Nix gates pass; the known default verify exception
remains. The exact deployment passed guarded live playing handoffs both ways using 120-ms
presses. Diagnostic profiles are now outside /tmp, stopped/unreachable; user queues remain
four/empty. See `docs/operations/2026-09-06-m3-handoff-click-stability.md`. This reproduces a
matching failure class, not a capture or acceptance of the user's own gesture.

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
client suite at that milestone had 195 passing tests; contract, production/PWA, Nix package,
and flake gates passed. Current verification is recorded in the M3 validation report.

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

**M3 is implemented and deployed** at `https://pyxis.hummingbird-lake.ts.net`.
`d4adeb9` makes the host validate and deduplicate a directive, confirm the browser audio
operation, then record public session state. Refused autoplay, stream/decode failure,
storage rollback, load cancellation, and crash recovery are covered by tests. The worker
remains schema 8 after M5. Later diagnosis found additional issues; this is not a claim
that all physical-device failures have been explained.

Second-device acceptance began after M5. It exposed three browser-only readiness defects:
`0749c55` refuses cached remote reachability until a current pull or realtime event confirms
a live socket; `9a2e2ad` applies 370-album and session snapshots under one database lock instead
of reopening ProseQL per row; and `07840bc` lets account/session startup take that lock before
large offline-media reconciliation. All are deployed and covered by the client suite plus the
package gates. Subsequent Pause diagnosis led to `7353791`, which prevents generic
`session.list` reads from waiting for physical-output I/O. `081a989` exposes realtime failures
and closes unhealthy sockets; `4d888f8` separates the 120-second full-resync budget from the
30-second incremental-handler budget. `ecbb285` fences queued and post-await work from retired
sockets and serializes actual cursor writes across automatic reconnects. `423ce52` replaces
opaque worker bodies atomically instead of deep-merging them, so queue clear/handoff removes
old track/cursor fields. Equal-revision authoritative session pulls repair stale cached bodies
without discarding queued commands or introducing a migration.

Earlier Chromium checks proved durable reload, remote transport, and stopped-state handoff
to a synthetic target. They did not establish audibility or physical network-loss behavior.
The September retest uses two real browser profiles and a browser-only connection-cut proxy.
Large-library startup and command convergence remain performance concerns, not accepted feel.

**Milestone M2 is complete and live on the tailnet.** The live 386-entry legacy manifest is
fully accounted: 370 albums are in Discovery, 16 remain unresolved after manual review,
and no import request failed. The durable audit is
`docs/operations/2026-08-21-v1-album-import.md`.

The current 2026-09-07 deployment is locked to `dcf702e` through the `pyxis` Nix profile entry,
priority 11, at `/nix/store/6jfrc5wlad9m7gjw5y1xgq1snn0az69p-pyxis-2.0.0`. The `pyxis.service`,
`pyxis-tsnet.service`, and `pyxis-ytdlp-update.timer` user units are active; local and tailnet
health return 200.

The previously reported old-system-unit risk is no longer observed: on 2026-09-06,
`systemctl show` reports both system `pyxis.service` and `tsnet-proxy-pyxis.service` inactive
with no loaded fragment or unit-file state. This pass made no NixOS configuration changes.
A proper NixOS module remains deferred.

Artwork persistence and refresh landed in `b22c0fd`; `f415040` records the successful backfill
of all 370 imported albums. The older untracked artwork parking-lot file remains untouched;
it is not evidence of unfinished implementation.

The 2026-09-06 independent review rechecked all eight historical cards. Six are fixed within
their original scope: header-first parsing, malformed album rejection, retryability mapping,
pre-U8 descriptors, plugin album-handler coverage, and batched relationship listing. Two
remained partly unresolved at that review: provider duration validation and placement
acknowledgements hiding newer queued intent. Earlier claims that all eight cards were stale
were too broad. The duration follow-up `01M1W0J02HD295KB4SCDV074MN` remains open.

The September 7 placement correction applies pending-intent lookup and the server verdict
under one account-fenced database lock. It reports remaining outbox entries at sync completion.
Five added regressions cover the race, ordered intent, verdict rollback, account fencing,
and real-WASM persistence. All 253 client and 84 plugin/SDK tests pass, with Rust tests,
contract checks, typecheck, owned-source lint, and PWA build verification. The user approved
local integration with the inherited prototype lint exception: 29 errors and 17 warnings,
also present on clean baseline `69432ce`. This closes placement follow-up
`01M1W0HN5JXHGDWCHV269DQZ40` locally. The later authorized startup deployment `dcf702e`
also includes this correction. Combined tests pass; no new live placement mutation test was
performed. See `docs/operations/2026-09-07-placement-sync-race.md` for evidence and limits.

The analogous session-command race was reproduced independently and remains separate in
`01M1Y7QS1QWPHXN5JY8P14RXRT`. The existing ProseQL query-cache follow-up
`01M1VZZYSRGB8C8G4Y0WMS2MXS` also remains open. Refresh-under-lock is still required.

**M4/U18 was product-accepted on real Sonos hardware on 2026-08-24.** The current Sonos
regression requires revalidation, as recorded above. The TypeScript output plugin
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
three visible plugins with only `source` and `output`; local and tailnet health are 200.

**M6 product acceptance completed on 2026-08-24.** Test credentials were stored through the public
encrypted config operation and never appeared in responses or plaintext storage. The live network
returned both ambiguous candidates, which entered patient monthly retry, and an automatic match
for A Static Lullaby's “Withered”. Pyxis downloaded 32,853,203 bytes from a peer, verified a
239.347-second stereo FLAC at 44.1 kHz and 1,098 kbps, registered it as a lossless local candidate,
and marked the persistent job satisfied. An authenticated byte-range request returned `206`,
`audio/flac`, the local candidate id, the exact `0-1023/32853203` range, and bytes identical to the
stored file. Live acceptance exposed that durable imports inherited the staging `.partial` suffix;
`2840076` now names them from the verified format, has a regression test, passed the full Rust
suite/clippy, passed an exact-commit Nix build and flake check, and is deployed as
`/nix/store/w2s7994jw1m12q33vna7c38g1s5fwf0v-pyxis-2.0.0`. The accepted file and record were
repaired to `.flac`. The temporary credentials were removed afterward, leaving the scheduler
idle while the verified local upgrade remained available.

**Soulseek configuration follow-up, 2026-09-07:** The user supplied a temporary account and
asked to leave it configured for later rotation. The public `plugin.config.set` operation
succeeded for `default` at 15:04:55 UTC. Credentials remain encrypted and were not written to
scripts or reports. The scheduler rechecked the existing satisfied job, then started a fresh
attempt at 15:06:40 UTC. No code deployment, restart, forced retry, or Sonos command occurred.
By 15:09:54 UTC, two new automatic upgrades completed as lossless FLAC. Their ready files
matched stored sizes of 9,772,421 and 39,784,191 bytes. The core journal recorded completion;
a separate ambiguous match entered retry. This proves resumed upgrades with the supplied account,
not long-running throughput or physical playback. Leave the configuration installed until the
user rotates or removes it. See
`docs/operations/2026-09-07-soulseek-background-enablement.md`.

The user subsequently said **“Nevermind, I was handing off from the wrong device aparently.
Let's move to the next thing.”** Close the reported browser-handoff issue on that basis, not
as proof that either diagnostic patch resolved their case. Direction/error affordances remain
parked; do not ask for another identical handoff test.

Current focus is the remaining **Sonos report**. Read-only checks reproduced discovery failing
after 25.903 s and succeeding after 29.862 s, while direct identity-checked topology reads were
fast under both Bun and Node. The user then clarified that devices were flashing in/out of the
browser. `6334018` now retains known output rows with truthful availability and disabled
unavailable session controls. Review found and verified a correction for delayed resyncs undoing
that clamp; session publication is fenced across connection failure/retirement. Six regressions,
248 client/71 plugin tests, independent review, and scoped build/Nix gates pass.

The exact `6334018` deployment serves `index-DVvhGIPJ.js`. A read-only production check kept the
same output DOM rows through availability changes, a real diagnostic-only network cut, and
recovery. Diagnostics are stopped/unreachable; Kitchen retains 42 tracks/revision 21 and Living
Room is empty/revision 33. No speaker playback/queue/group/volume command was issued.
See `docs/operations/2026-09-06-m4-output-visibility.md` and the preceding discovery report.

The user confirmed the entries no longer blink, but the controls remained disabled. Visibility
is accepted; Sonos reliability is not. Read-only traces proved the Avahi helper could outlive its
2500ms deadline by seconds (up to 27391ms). Reviewed `f95ed25` bounds that ephemeral helper and
drops interrupted records; 248 client/74 plugin tests and scoped gates pass. It was deployed on
September 7 at 07:19 MDT, after checking no reachable session was playing.

The user explicitly approved restarting shared Avahi. That restart completed on September 6 at
23:12:46 after a 74-second graceful SIGTERM exit; the initial shell timeout did not cancel systemd's
job. New PID 2493290 initially used 0/0/1% CPU and answered version reads in 3/5/5ms instead of
289–2671ms. Permission is no longer pending. No second restart or manual kill was issued.
Kitchen still dropped out in a subsequent read-only watch. Longer header/reuse comparisons failed
equally across variants, so no HTTP workaround was introduced.

Two diagnostic-only longer-budget traces then captured three complete Kitchen position replies
at 5033/5033/5019ms, beyond the ordinary three-second deadline. Reviewed `c1d0e6e` adds optional
`positionTimeoutMs`, defaulting to the greater of eight seconds and the request budget. Only the
position read changes; other request/write budgets, complete-body waiting, genuine failures,
stream ownership and account guards remain. No cached/partial state substitutes for a timeout.
Twelve new regressions, independent review, 248 client/86 plugin tests and scoped gates pass.
A guarded plugin read accepted a real 5027ms response. The exact revision was deployed at
08:29:29 MDT on September 7; live plugin source and profile were verified. Default verify retains
25 prototype errors/16 warnings; the initial temporary full-gate logs went missing and the same
gates were rerun successfully directly into a durable archive.

The deployed three-minute watch found both rooms reachable in 88/90 samples, but a brief two-room
failure still occurred before recovery. Its cause remains unproven. Kitchen was stopped with
9 tracks/revision 23 before and after this deployment; Living Room stayed stopped/empty/revision
33. Kitchen's change from the earlier 42/revision 21 snapshot predates this deployment; read-only
observations do not establish its origin. No queue was restored or otherwise altered by diagnostics.
The library remains 370, diagnostic browsers are stopped/unreachable, services and endpoints are
healthy. See `docs/operations/2026-09-06-m4-discovery-deadline.md` and
`docs/operations/2026-09-07-m4-position-deadline.md`.

The user then selected **"Both rooms enabled"** when asked to inspect Kitchen and Living Room
without starting playback. This confirms the controls are enabled, not that physical commands
or playback work. The disabled-controls retest is closed; do not repeat it.

Next isolate the stage/typed failure behind the remaining brief availability loss. The user
explicitly said **not to play anything on Sonos**; continue with reads only, never playback,
queue, grouping or volume commands. Physical
acceptance remains open. Do not reopen the user-closed handoff report or accepted latency tuning.

Album removal is no longer deferred. D17 records your decision: server removal wins,
queued local placement intent is discarded, and the client reports the conflict.

Execution order is the `Shipping Milestones` table in `plan.md`, not numeric U-ID order.
Per-unit progress comes from `git log`, not from this file.

Ship only at a milestone boundary.
