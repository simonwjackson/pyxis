# Console fixture scheduling, 2026-10-16

## Result and limit

Two Console test families now use explicit fixture readiness and completion promises instead
of one-second callback polling. A separate follow-up makes the same-revision disconnect fixture
await realtime welcome readiness before delivering events. Production code, public contracts,
dependencies, renderer confirmation, durable outbox handling, account fences and event retirement
are unchanged.

This proves a **bounded-fixture-wait scheduling defect**, not the cause of the historical
Cargo-load failures. Current `ca37cd0` passed the two original cases once without artificial
load and six times beside a fresh Cargo build. No historical-revision comparison was needed
for this narrower correction. The historical cause remains unknown.

## Deterministic regression

The existing real `ReferenceApp`, direct `WorkerClient`, database and RPC fixtures still run.
Two additional cases delay a worker operation by **1250 ms of virtual time**:

- Before the real `queueSessionCommand`, so the command acknowledgement fixture starts later.
- Before returning the real session snapshot for a library event, so the snapshot hold starts later.

The fixture waits for realtime handlers, command entry or snapshot entry explicitly. It awaits
session sync completion before asserting the empty durable outbox. All original state and
retirement assertions remain. Held work drains in `finally`. Virtual timers are restored before
subsequent assertions and again in `afterEach`. The Vitest timeout remains 5000 ms; no timeout
increase, retry or serial configuration was added. The injected delay does not sleep in real time.

| Observation | Result |
|---|---|
| Old coordination with delayed worker fixtures | 2 failed / 2 passed, exit 1, 2.881 s |
| Corrected coordination, same delays | 4 passed, exit 0, 3.983 s |
| Restore old callback polling on the corrected fixtures | 2 failed / 2 passed, exit 1, 4.146 s |

Both negative controls fail at the callback assertions: `expected undefined to be type of
'function'`. Immediate controls pass. Neither negative control fails from React deadlock or
the overall test timeout. Intermediate harness probes did expose a fake-timer stall in the
later outbox polling; those probes are not product-defect evidence. The final fixture restores
real timers after the scheduled operation and awaits the actual synchronization promise.

## Checks

All Vitest runs use the installed dependencies, **Node 22.23.2** and **Vitest 4.1.10**, without
an upgrade. Cases use normal collection order, not randomized order; there is no random seed.

| Check | Result |
|---|---|
| App/reference/worker tests | 337 passed initially; final combined tree 338 passed, exit 0 |
| Player tests | 274 passed, exit 0 |
| Player architecture tests | 12 passed, exit 0 |
| Player architecture gate | clean, exit 0 |
| Player typecheck | exit 0 |
| Owned Console Biome check | exit 0 |
| Repository Biome | exit 1: 30 errors / 18 warnings in unchanged files |
| Concurrent Rust tests | 206 passed / 1 inherited date-dependent listen failure, exit 101 |
| `just verify` (one invocation) | exit 1 at inherited `sessions/machine.rs:84` formatting; later recipes did not run |
| Root typecheck after all installed workspace dependencies were linked | exit 2: inherited player JPEG import |
| Explicit Console TSX typecheck | exit 2: 18 inherited diagnostics; identical to original file after ignoring positions |

The root configuration does not include Console TSX. The explicit check compared the original
and corrected file in the same environment. It adds no diagnostic. An initial root typecheck
also lacked workspace dependency links; that setup failure is not classified as inherited.

## Concurrency evidence and remaining failure

Five full Console runs used eight CPU burners and Vitest pinned to CPUs 0–1, plus a temporary
512 KiB write/fsync/delete loop. Cargo built and tested concurrently with the first three runs.
All four target cases passed in all five runs (**20/20**). Four full runs passed **86/86**.
The first failed a different case, **`a same-revision disconnect removes a remote session
without a full sync`**, at `getByText(/Kitchen/)`: **85 passed / 1 failed**. That separate
failure was investigated below. Its original untraced cause remains unresolved; no general
load-stability claim is made.

Full-run wall times were 36.964, 32.849, 39.598, 39.992 and 32.085 seconds. The first load-average
values were 10.98, 17.98, 18.97, 19.79 and 30.37. Cargo completed with exit 101 at the already
recorded date-dependent `listen_rpc` test. All eight burners and the storage writer were stopped;
the temporary storage directory was removed. No shared server, service or live provider was
started or contacted.

## Follow-up: asynchronous realtime welcome

The primary third-case failure remains `console-load-after-0.log`: an immediate missing-`Kitchen`
assertion with `Status: ready` and no remote row. It has no handler/application trace. It does not
prove missing handlers, startup overwrite, renderer lag, or leakage from the preceding virtual-time
case. It is **not** classified as inherited or causally resolved.

Five isolated and five adjacent probes on `247c70a` used eight burners, CPU affinity 0–1 and the
storage writer, without Cargo. All passed. Each trace showed real timers, the same undefined
`IS_REACT_ACT_ENVIRONMENT`, installed handlers, one event application and two startup snapshots.
These probes did not reproduce persistent timer/act leakage; they do not exclude an intermittent
ordering problem. Instrumentation was removed. The first correction's restored-polling negative
control contains one act-environment warning; it remains in the raw evidence, not hidden.

A separate deterministic regression now holds a valid asynchronous welcome at the actual
`ReferenceClient.connectRealtime` seam. It returns the disconnector synchronously. After welcome
release it calls `onResync`, persists the welcome cursor through `onResumeToken`, calls
`onConnected`, then exposes event delivery. This matches the documented public welcome sequence.
The test covers both an already-established connection and welcome still pending when the page
reports ready. It uses no fake timers or real sleeps.

The corrected test requires the connection-ready delivery function and awaits each event. The
original visible-row, same-revision removal and no-full-sync assertions remain. `finally` releases
welcome and drains its work, including failure propagation.

| Isolated control | Result |
|---|---|
| Old optional delivery, same welcome fixture | connecting case fails at the exact missing-`Kitchen` assertion; connected case passes; exit 1, 2.198 s |
| Required connection-ready delivery | both pass; exit 0, 2.038 s |
| Restore optional delivery on the final fixture | exact missing-`Kitchen` failure again; connected case passes; exit 1, 1.895 s |

Both isolated negative controls have zero act-environment warnings. They skip all preceding test
cases, so this deterministic readiness weakness does not require the new virtual-time case.
This does **not** prove that weakness caused `console-load-after-0.log`.

After this last test-only correction, two complete Console runs under the same CPU/storage load
passed **87/87**, in 20.981 and 19.475 seconds. The final app run passed **338/338** in 7.205 seconds.
Owned Biome passes. Explicit Console TSX checking still reports exactly the original 18 diagnostics,
with no additions after ignoring line positions. Player, Rust, architecture and whole-repository
gates above were not unnecessarily rerun for this second test-only correction. All load processes
were stopped. No production behavior was changed.

## Evidence and rerun

Raw stdout/stderr, command arguments, actual exits, runtime versions, timing JSON and local
Nix-shebang harnesses are under the coordinator's ignored artifact directory:

`.forgerie/attachments/console-flakes/20261016/`

Key files: `baseline.*`, `cargo-before-*`, `scheduled-before.*`, `scheduled-refined.*`,
`negative-control-final.*`, `console-after.*`, `console-load-after-*`, `checks.json`,
`console-typecheck-comparison.json`, `root-typecheck-linked.*`, `root-biome-final.*` and
`verify-final.*`. Follow-up evidence: `disconnect-trace-*`, `disconnect-scheduled-old.*`,
`disconnect-scheduled-new.*`, `disconnect-negative-final.*`, `console-combined-load-*`,
`app-tests-combined.*`, `owned-biome-combined.*`, `console-typecheck-combined.*` and
`combined-check-comparison.json`.

From `clients/app` with the supported Node runtime and installed dependencies:

```sh
node node_modules/vitest/vitest.mjs run src/reference/Console.test.tsx
```

The permanent scheduling cases run through that normal command. Local `loop.py` narrows it to
the two target names. `negative-control.py` temporarily restores only the old callback polling,
captures its failures, and restores the corrected source in `finally`.

No old nightly commit was reused. No merge, push, deployment, live API or Sonos action occurred.
