# M3 reconnect and two-browser validation

## Status

M3 is implemented and deployed, but **not product-accepted**. This report separates
automated renderer/state evidence from physical-device audibility, autoplay, and feel.
M1, M2, M4, M5, M6, and M7 remain accepted. No Sonos hardware commands were issued in this pass.

## Deployment

- Current runtime commit: `12e422e59346820750b291dd8baa1cd60d303e10` (includes the latency follow-up below).
  The initial two-browser validation used `423ce52`.
- Built the explicit Git revision, added it through `nix profile add` alongside the older
  entry with a distinct priority, verified its lock/store path, then removed the older entry
  and restarted the user core. The lock is immutable, not a dirty tree.
- Package: `/nix/store/4g3ha9rhy5ryb7idbzgm846n0f5n966y-pyxis-2.0.0`.
- Current profile entry: `pyxis-1`, explicitly locked to the revision above.
- Origin: `https://pyxis.hummingbird-lake.ts.net`.
- Client bundle: `assets/index-gPOm4uK-.js`; worker schema remains 8.
- Local and tailnet health return 200. Core, tailnet, and updater timer user units are active.
- No push or NixOS switch was performed.

The earlier warning about old system-service declarations is no longer observed.
`systemctl show pyxis.service tsnet-proxy-pyxis.service` reports both system units inactive,
with no loaded fragment or unit-file state. This pass did not change those declarations.

## Fixes leading to this run

- `7353791`: generic `session.list` reads no longer wait for physical-output I/O.
- `081a989`: terminal realtime and durable-handler failures become visible and close the
  unhealthy socket without deliberately advancing its cursor.
- `4d888f8`: full snapshots get a 120-second budget; incremental handlers retain 30 seconds.
- `ecbb285`: queued and post-await continuations check whether their connection is still
  active. Failure, close, and disposal retire it. Actual cursor writes serialize across
  automatic reconnects, even when a timeout wrapper has already failed.
- `423ce52`: contract-owned worker bodies use atomic `$set` replacement rather than deep
  merging. An omitted current track/cursor after queue clear or handoff now disappears.
  Authoritative equal-revision session pulls repair stale cached bodies while excluding
  queued commands and preserving newer local revisions. No schema change, migration, or
  delete/reinsert is involved.

The realtime fix addresses two independently reproduced races: frames already queued before a
failed state/cursor write could still run, and a retired socket could finish after its
replacement and overwrite the newer cursor or publish readiness. Seven regression cases
cover failed state and cursor writes, late resync/event completion, disposal, and cursor
storage across both socket closure and timeout.

An already-started storage operation cannot be cancelled by this transport. Cursor writes
therefore wait for the actual preceding write to settle. Permanently stalled storage remains
unhealthy rather than permitting overlapping durable writes. The queue is scoped to one
`connectRealtime` invocation; this is not a general cancellation mechanism for callback effects.

The original physical desktop failure was not conclusively explained. Do not attribute it
retroactively to autoplay or to these races without a matching reproduction.

## Initial review and automated gates

A synchronous independent reviewer successfully reproduced both races before the fix.
Follow-up review found no residual defect within the automatic-reconnect scope and exercised
late event/resync/cursor rejection with real-timer probes against the actual client. Earlier
reviewer launch failures are not counted as reviews; asynchronous launch still lacked `jiti`.

Verification for the deployed fix:

- 68 focused API/Console tests pass, including seven new regression cases.
- Initially 207 client tests, then **210** after the snapshot fix, plus 71 plugin/SDK tests pass through
  `nix develop -c bun run --shell=system test`.
- Rust tests (68 unit tests plus all integration tests), Clippy, Rust formatting,
  shellcheck, generated-contract drift, and TypeScript typechecking pass.
- Owned-source Biome, production client/PWA verification, the exact-commit Nix package
  build, and the host-system flake check pass.

**The repository-wide gate is not green.** `just verify` stops at unrelated prototype lint
(21 errors in this run); those files were left untouched. Running its remaining test step
with Bun's default shell also repeatedly failed four default-worker Console tests, while
both direct client execution and the system-shell aggregate passed. This discrepancy is
captured in `01M1VYMTS337M8Y71D6FFMSYT9`, not concealed as a passing default command.

Three real-WASM regressions exposed and now guard snapshot replacement: clearing a session
removes its former current track/cursor across reopen, an equal-revision pull repairs an
already-stale body, and a pin snapshot clears an omitted error. The first probe used explicit
`undefined` fields and passed, but that is not the public JSON shape and failed typechecking.
The correctly typed omission test reproduced the real defect before the fix.

A second independent review checked the pinned ProseQL `$set` and persistence semantics and
found no blockers. Its failure-injection probe confirmed a rejected replacement quarantines
the engine and reopening retains the original durable row. It also verified queued-intent
and newer-revision protection. These were real WASM/Web Storage tests, not IndexedDB quota
injection. A separate query-cache visibility concern is recorded in
`01M1VZZYSRGB8C8G4Y0WMS2MXS`; production reopen-under-lock remains intact.

## Initial two-browser validation

Chromium 146.0.7680.75 ran with separate durable profiles, production workers, WASM,
IndexedDB, Web Locks, service workers, and WebSockets. Audio was muted at the browser level;
renderer playback and authoritative session state were observed, not human audibility.

| Host | Device | Session |
|---|---|---|
| A, restored diagnostic profile | `01M12Q6VFZFMMXP89BF297HDEF` | `01M12Q96B93ZH4K8FCJ468XAVD` |
| B, newly created diagnostic profile | `01M1VYWKW6AXGPBGMW2FQE5P5F` | `01M1VZ1EJDRKSSXPS839H5GH38` |

These are diagnostic hosts, not assumed identities for the user's phone or desktop. The
Local store panel initially displayed a provisional device id on B; correlation used the
hosted-session identity instead. A's three identical queue entries predate this pass and
came from earlier diagnostic adds, not replay duplication.

The initial completed run used `ecbb285`; the complete smoke passed again on final runtime
`423ce52`, adding an assertion that each emptied handoff source shows no current track.
The bounded CDP smoke exercised:

1. Local trusted Play and Stop on each host, with renderer movement and durable convergence.
2. Public `session.command.send` from each browser to the other: Play, Pause, Play, Stop.
   Resulting core revisions and host renderer state agreed; the console did not start audio.
3. Target queue clearing, followed by stopped-state handoff A → B and B → A. Each recipient
   then played and stopped its received queue; the source had no playing renderer.
4. A real connection cut, not CDP's inconclusive network-emulation setting: A's HTTPS and
   WebSocket traffic passed through a loopback CONNECT proxy. Disabling it closed existing
   tunnels and refused new ones, without changing system networking or interrupting B/core.
5. Core reachability became false, A showed the realtime failure, and B's attempted queue
   command returned `unreachable`. Restoring the proxy recovered automatically; the refused
   command did not appear later and A's queue was unchanged.
6. Reload preserved A's host identity, session, three queue entries, and zero deferred writes.

The first script attempt asked for handoff after observing an optimistic empty queue but
before the core had confirmed it; `targetBusy` correctly refused the request. The completed
run explicitly waited for both durable core and ready UI state. This is not recorded as a
handoff implementation failure or as a successful first attempt.

The smoke used public RPC calls evaluated in each browser for remote commands/handoff.
It did not click every remote-control button. Component tests cover those bindings; physical
use of the actual control surface remains part of acceptance.

After the initial completed run, both diagnostic browsers and the CONNECT proxy were stopped. Public
`session.list` confirmed A stopped/unreachable at revision 39 with three entries, and B
stopped/unreachable at revision 35 with an empty queue. No diagnostic process remained at
that checkpoint; the later latency pass reopened these profiles. Their durable records remain; session deletion is deferred. Final local and
tailnet health are 200, the three user units are active, and LAN `/rpc` remains 404.

## Timing and limits

- First startup: B fresh **87.1 s**; A restored with the artwork backfill **152.9 s**.
  A temporarily reported `realtime resync timed out`, then recovered. This is an unresolved
  startup/performance concern, not a successful sub-120-second resync.
- Subsequent warm startup: B **3.2 s**, A **3.8 s** on `ecbb285`; both **4.4 s** on `423ce52`.
- Remote command-to-core/UI convergence: roughly **2.3–8.3 s** in the earlier runs;
  **3.2–7.7 s** on final `423ce52`.
  These timings include durable synchronization and polling, not only renderer response.
- Handoff plus recipient Play/Stop and convergence: **11.3 s** forward, **13.1 s** reverse
  initially; **15.5 s** forward and **10.7 s** reverse on final `423ce52`.
- Forced close, observed unreachability/error, and refused command: **57 ms** initially,
  **22 ms** on final `423ce52`, on this local
  setup. This does not establish dead-peer detection time for a silently blackholed network.
- Network restoration check: **4.3 s** initially, **4.0 s** on final `423ce52`, including a
  deliberate 2.5-second observation period
  to ensure the refused command did not replay.

Performance follow-up `01M1VZ456T3R9EWQ1367WAFTWY` requires profiling the real storage path
before changing it. Do not hide the issue with larger timeouts, skipped durable writes,
runtime storage failover, or weaker cross-tab/account fences.

## Manual responsiveness failure and latency follow-up

The user tested normal and incognito windows, confirmed normal-window playback, and reported
**a major delay** when controlling it from the other browser. M3 acceptance was paused.
The server still returned all 370 albums quickly (63 ms); the initially empty browser library
filled without clearing storage. Slow first sync remains unresolved.

All subsequent commands targeted only the known diagnostic hosts above. The user's session
`01M1W59YH76407X22XSRB4A3W6` was never commanded by the probes. Read-only checks found no live
user playback before the service restarts. No Sonos commands, pushes, or NixOS switches occurred.

### Changes and review

- `6855cf0` adds `applySessionEvent`: an authoritative session event no longer starts a full
  library sync. The worker applies one snapshot under its existing refreshed account-fenced
  lock, preserves newer revisions and queued intent, and accepts same-revision reachability
  changes. An event for another session hosted by the same device cannot steal the renderer.
- Initial review caught a delayed-acknowledgement race in the first implementation: ignoring
  a queued event and advancing its cursor let an older RPC reply replace it permanently.
  The corrected handler retains the event, awaits outstanding synchronization, and reapplies
  before cursor advancement. Still-blocked events reconcile and retry or fail honestly;
  retired connections cannot retry. Single-delivery newer-revision, equal-revision-unreachable,
  and retired-handler regressions pass; independent follow-up review found no blocker.
- `578f11b` adds `syncSessions()`. Transport and queue feedback pull/replay only sessions,
  through the existing command receipt/fingerprint/retry path and shared sync queue. They
  do not read albums, push placements/listens, or resume offline-media reconciliation.
  Unrelated intent remains queued and counted. Startup, replay gaps, library changes, and
  listen submission still run full sync. Settings reads are no longer duplicated.
- `12e422e` fixes a separately reproduced Stop blip: clearing the audio source allowed the
  automatic loader to restart the still-durable Playing snapshot before storage finished.
  Source-reset commands now retain renderer ownership through publication or explicit rollback.
  Eight delayed-write cases cover Stop, clear, cursor jump, and current-item removal.
  Independent review also exercised a revision retry that changes current-item removal into
  non-current removal, followed by later Stop/Play.

Each slice received an independent review before its exact-revision Nix deployment. Final
verification: **232 client tests and 71 plugin/SDK tests**, typechecking, owned-source Biome,
production/PWA build, Nix package build, and host flake check pass. Rust tests, Clippy,
formatting, shellcheck and generated-contract drift passed earlier in this pass; no Rust or
RPC schema changes followed. `just verify` was rechecked and still stopped at unrelated
prototype lint, now **25 errors and 16 warnings**. The aggregate tests used the documented
system-shell workaround; the earlier default-shell discrepancy is not claimed resolved.

### Measured response, not acceptance

An instrumented production Chromium profile recorded command-frame receipt, worker work,
and actual media events separately. It used the same 370-album diagnostic host before and
after the changes. These are small samples under varying workstation load, not benchmarks
with statistical confidence. Browser audio was muted.

| Sequential command | Original renderer effect (`423ce52`) | Final renderer effect (`12e422e`) | Final core/UI convergence |
|---|---:|---:|---:|
| Pause after local Play | 652 ms | 460 ms | 4041 ms |
| Play | 4482 ms | 2930 ms | 4325 ms |
| Pause | 3098 ms | 1718 ms | 3403 ms |
| Play | 3023 ms | 1467 ms | 3330 ms |
| Stop | 3093 ms first pause; restarted; 3600 ms final pause | 1649 ms, no restart | 3327 ms |

The intermediate event-only fix still took 2247–4546 ms for subsequent Play/Pause effects;
it was not called sufficient. Session-scoped replay removed more of the blocking work.
The final back-to-back commands remain noticeably slower than idle commands.

A separate final sample waited five seconds between commands. Renderer effects then took
**335–455 ms**, with core/UI convergence **1814–2991 ms**. Do not substitute these idle
numbers for the back-to-back result. Socket dispatch in the final samples was 175–264 ms.
No Pause/Stop sample restarted playback after the renderer fix.

The final package also passed the complete two-host smoke again: local and bidirectional
remote transport, stopped handoff in both directions with cleared source fields and recipient
playback, real proxy connection cut, refused offline command without replay, recovery, and
queue-preserving reload. Warm startup was 4880–6210 ms; core/UI command convergence 2222–3641 ms.
Handoff plus recipient Play/Stop took 12328 ms forward and 9853 ms back. Forced-close/refusal
observation took 57 ms; restoration took 4102 ms including the 2500-ms no-replay observation.
This remains a forced-close test, not silent-blackhole detection.

**A later instrumented two-host run was substantially worse and is not discarded.** It
recorded both directions separately:

| Direction | Renderer effect range | Core/UI convergence range |
|---|---:|---:|
| B → A | 3244–4593 ms | 8162–11391 ms |
| A → B | 1675–14459 ms | 3335–22615 ms |

That run coincided with an unrelated concurrent Nix build and high workstation disk pressure:
`/proc/pressure/io` reported 37.47% full-stall time over ten seconds (46.74% some-stall).
CPU pressure was low; free memory including cache was about 19 GiB, despite nearly full swap.
These observations are a timing confound, not proof that every delay came from the build.
The functional assertions and no-Stop-restart checks still passed. The result confirms that
responsiveness under load remains unresolved; the faster single-host numbers are not a
blanket latency guarantee.

After disk pressure settled, the same bidirectional script passed again. I/O and memory
full-stall `avg10` stayed at 0.00 in two-second samples throughout the run:

| Direction, quieter repeat | Renderer effect range | Core/UI convergence range |
|---|---:|---:|
| B → A | 488–1431 ms | 2663–3142 ms |
| A → B | 723–1488 ms | 2147–3052 ms |

Later back-to-back Pause/Play/Stop effects were 1289–1488 ms. This confirms better behavior
when the workstation is quiet, not acceptable behavior under every workload. Both samples
remain part of the acceptance evidence.

Core/UI convergence means the server's durable transport and the displayed transport agreed.
The displayed deferred count is a previous sync report, not a live outbox read; these timings
do **not** establish the exact instant the local outbox drained. Cold/full-library startup
was not remeasured or fixed. Responsiveness and audibility still need user acceptance.

Local evidence files: `/tmp/pyxis-m3-latency-before-instrumented.jsonl`,
`/tmp/pyxis-m3-latency-after-events.jsonl`, `/tmp/pyxis-m3-latency-session-sync.jsonl`,
`/tmp/pyxis-m3-final-renderer-profile.jsonl`, and
`/tmp/pyxis-m3-final-renderer-idle-profile.jsonl`. The last two assert the served bundle and
refuse to command any session except diagnostic A. Final functional and bidirectional timing
logs are `/tmp/pyxis-m3-final-latency-two-browser.log` and
`/tmp/pyxis-m3-bidirectional-renderer-timing.log`; both scripts assert the exact final bundle
and the two known diagnostic session IDs before issuing commands. The quieter repeat is
`/tmp/pyxis-m3-bidirectional-quieter-timing.log`, with pressure samples in
`/tmp/pyxis-m3-bidirectional-quieter-pressure.jsonl`.

### Final cleanup

All latency-profiling browsers and the browser-only proxy were stopped. Public read-only
observation verified A stopped/unreachable at revision 98 with its original three entries,
and B stopped/unreachable at revision 64 with an empty queue and no current track.
The library still contains 370 albums. Local and tailnet health return 200, all three user
units are active, LAN `/rpc` returns 404, and no matching warning/error appeared in the last
ten minutes of the core journal. Profile metadata still points to exact `12e422e`.

M3 and the performance follow-up remain open. The next user check is responsiveness in the
normal/incognito windows after refreshing both; physical-device audibility, autoplay,
handoff, and background/network behavior remain separate acceptance work.

## Historical review cards

The independent reconciliation checked all eight old cards against current code and targeted
tests. Six are fixed within their historical scope: header-first album parsing, malformed
album payload rejection, retryability mapping, safe pre-U8 descriptors within the rewritten
store, plugin album-handler coverage, and the batched relationship-list hot path.

**Two cards are not fully resolved**, despite earlier notes describing all eight as stale:

- Duration parsing still accepts empty components and a final value beyond the core's u32
  range. A parser probe reproduced `:` → 0 and `999999999:00` → 59999999940000 ms.
  Follow-up: `01M1W0J02HD295KB4SCDV074MN`.
- Placement acknowledgement reads pending intent and replaces the album in separate locked
  operations. A deterministic probe inserted Archive in that gap; its outbox entry survived,
  but the visible row reverted to Collection and the report counted no deferred entry.
  Follow-up: `01M1W0HN5JXHGDWCHV269DQZ40`. No permanent intent loss was demonstrated.

These are pre-existing source/offline follow-ups, not regressions introduced by the M3
changes. The harness still lists all eight cards because no residual-resolution tool is
available; do not equate that count with either eight current defects or zero current defects.
A minor schema comment and single-album lookup costs also remain outside this pass.

## Remaining physical acceptance

On the user's phone and desktop, apply the offered update and verify actual hosted session
IDs; do not infer them from old diagnostic identities. Then verify:

- Audible local playback and safe behavior after reload/autoplay refusal.
- Play/Pause/Stop from each physical device to the other, with the correct sole audio host.
- Physical disconnect/reconnect behavior, including backgrounding where relevant.
- Stopped-state handoff in each direction, followed by audible playback on the recipient.
- Whether startup and control responsiveness are acceptable.

Record exact Runtime errors, session/host IDs, transport revisions, and deferred writes for
any failure. M3 remains open until this acceptance is explicit. The reference UI remains
deliberately unstyled; visual design and further Sonos hardware testing are outside this pass.
