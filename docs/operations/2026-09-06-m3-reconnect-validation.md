# M3 reconnect and two-browser validation

## Status

M3 is implemented and deployed, but **not product-accepted**. This report separates
automated renderer/state evidence from physical-device audibility, autoplay, and feel.
M1, M2, M4, M5, M6, and M7 remain accepted. No Sonos hardware commands were issued in this pass.

## Deployment

- Final runtime commit: `423ce5217688d93a8ae74b139db5292c57cc3e22` (includes `ecbb285`).
- Installed through `nix profile add` using an explicit Git revision, after building that
  revision and removing the previous profile entry. The lock is immutable, not a dirty tree.
- Package: `/nix/store/qdn4bnrxw7cjd6fgjbyfbc584ylcry9g-pyxis-2.0.0`.
- Origin: `https://pyxis.hummingbird-lake.ts.net`.
- Client bundle: `assets/index-CjOZqMGp.js`; worker schema remains 8.
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

## Review and automated gates

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

## Two real browser hosts

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

After the final run, both diagnostic browsers and the CONNECT proxy were stopped. Public
`session.list` confirmed A stopped/unreachable at revision 39 with three entries, and B
stopped/unreachable at revision 35 with an empty queue. No diagnostic background process
remains. Their durable session records remain; session deletion is deferred. Final local and
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
