# Console fixture scheduling, 2026-10-16

## Result and limit

Two Console test families now use explicit fixture readiness and completion promises instead
of one-second callback polling. Production code, public contracts, dependencies, renderer
confirmation, durable outbox handling, account fences and event retirement are unchanged.

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
| App/reference/worker tests | 337 passed, exit 0 |
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
fixture needs follow-up; this patch does not claim a fully load-stable Console file.

Full-run wall times were 36.964, 32.849, 39.598, 39.992 and 32.085 seconds. The first load-average
values were 10.98, 17.98, 18.97, 19.79 and 30.37. Cargo completed with exit 101 at the already
recorded date-dependent `listen_rpc` test. All eight burners and the storage writer were stopped;
the temporary storage directory was removed. No shared server, service or live provider was
started or contacted.

## Evidence and rerun

Raw stdout/stderr, command arguments, actual exits, runtime versions, timing JSON and local
Nix-shebang harnesses are under the coordinator's ignored artifact directory:

`.forgerie/attachments/console-flakes/20261016/`

Key files: `baseline.*`, `cargo-before-*`, `scheduled-before.*`, `scheduled-refined.*`,
`negative-control-final.*`, `console-after.*`, `console-load-after-*`, `checks.json`,
`console-typecheck-comparison.json`, `root-typecheck-linked.*`, `root-biome-final.*` and
`verify-final.*`.

From `clients/app` with the supported Node runtime and installed dependencies:

```sh
node node_modules/vitest/vitest.mjs run src/reference/Console.test.tsx
```

The permanent scheduling cases run through that normal command. Local `loop.py` narrows it to
the two target names. `negative-control.py` temporarily restores only the old callback polling,
captures its failures, and restores the corrected source in `finally`.

No old nightly commit was reused. No merge, push, deployment, live API or Sonos action occurred.
