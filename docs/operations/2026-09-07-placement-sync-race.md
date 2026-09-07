# Album-placement acknowledgement race

The correction preserves newer placement intent and reports remaining queued writes.
The user first approved local integration with the inherited lint exception below. The later
user-authorized startup rollout deployed `dcf702e`, which includes this correction and passes
261 combined client tests. No new live placement mutation test was performed in that rollout.
See `2026-09-07-full-library-startup.md` for deployment evidence. Nothing was pushed.

## Reproduction and correction

The September 7 probe reproduced the historical race on main `69432ce`.
It used real `sync`, `openWorkerDatabase`, and `createMemoryEngine`, with configured RPC replies
and a scheduling Proxy. No service or speaker was contacted.

| Schedule | Visible placement after sync | Pending outbox | Reported deferred writes |
|---|---|---|---|
| Queue Archive before the acknowledgement reads pending intent. | Archive | One Archive write | 0 |
| Queue Archive between that read and the album replacement. | Collection | One Archive write | 0 |

Another sync applied Archive and emptied the queue in both cases. The probe demonstrated
temporary loss of visible intent, not permanent outbox loss.

The new regression failed for both intended assertions before implementation. Collection
replaced Archive, and `deferred` was zero instead of one. After the correction, the same
schedule preserves Archive, reports one deferred write, and replays it once on the next sync.

`WorkerDatabase.applyPlacementVerdict` now reads pending intent and replaces the album within
one account-fenced database operation. It excludes the settled write and retains the latest
matching placement in outbox order. Network requests remain outside the lock. Dequeue still
removes only the settled ID after successful local application.

The existing account guard moved from `entry.ts` to `account-fenced-database.ts`. Production
still refreshes the database under `offline.exclusive`, checks the current account there,
and invokes the method on that concrete database. Tests now exercise that same guard.
Internal database calls do not acquire a second lock.

`deferred` now counts the outbox at the final locked read. This includes writes added during
the pass and domains excluded by session-only sync. It does not promise that no later write
can arrive after that read.

The cost is slightly longer lock occupancy for a verdict and one final outbox read per drain.
This does not change conflict rules, add a schema migration, or solve session acknowledgements.

## Verification

All commands used the worktree's flake environment. Client tests used Node 22.22.1 and Vitest.
The repository's aggregate command runs plugin tests with Bun and client tests with Vitest.

| Check | Result |
|---|---|
| New scheduling regression before implementation | Failed with Collection instead of Archive and zero deferred writes. |
| Focused sync, database, replay property, real ProseQL, and worker-entry tests | 93 passed. |
| Full client suite | 253 passed. |
| Plugin and SDK tests through `just test-ts` | 84 passed, zero failed. |
| Rust tests through `just verify` | 68 unit tests and all integration suites passed. |
| Rust format, clippy, shellcheck, generated-contract check | Passed before the lint failure. |
| Whole-repository typecheck | Passed. |
| Owned-source Biome check | Passed. |
| Production client build and packaged PWA asset check | Passed, with 13 shell assets. |
| `just verify` | Failed at `lint-ts`, with 29 prototype errors and 17 warnings. |
| Clean detached baseline `69432ce`, `biome check .` | The same 29 errors and 17 warnings. |

The full repository gate is not green. The prototype files are unchanged by this correction.
No Fallow configuration exists in this checkout. No browser or physical-device acceptance,
Nix package build, deployment, or Sonos command was performed.

The first full-gate run also saw three formatting diagnostics in an agent-downloaded
`.pi/git` dependency. That clean, untracked checkout was moved outside the worktree before
the final gate. The first log is retained separately. The final gate matches the clean baseline.

Twelve review personas returned results after retrying unavailable default reviewer models.
The final independent review found no blocking defects. Rejected warnings relied on the
wrong client test runner, counted required deferred reporting as a bug, or assumed nested
lock acquisition. Package scripts, the concrete method binding, and the passing regressions
contradict those claims. No code changed merely to satisfy those warnings.

## Remaining work and safety

The analogous session path was probed independently on unchanged main. A second `queue.add`
completed before `replaceSession` applied the first acknowledgement. The local queue changed
from `[first, second]` to `[first]`, while the second command remained queued. Medium impact,
with no physical playback failure or permanent loss demonstrated. Follow-up
`01M1Y7QS1QWPHXN5JY8P14RXRT` owns that separate fix. This correction leaves `putServerSession`
unchanged but corrects its final deferred count through the shared reporting path.

A real-WASM test also reconfirmed the existing query-cache limitation: an outbox row was
persisted but absent from a same-handle query. Reopening exposed it. The regression now uses
production refresh boundaries. Existing follow-up `01M1VZZYSRGB8C8G4Y0WMS2MXS` owns upstream
invalidation work. Do not remove refresh-under-lock without an equivalent consistency proof.

D17 remains binding. Server album removal wins and produces an explicit conflict. Existing
removal, retry, ordering, and account-switch tests pass. No production data changed.

After a future authorized deployment, verify that a rapid Collection-to-Archive change
stays visible and that pending writes drain after recovery. An old placement reappearing,
a missing outbox entry, or a cross-account write is a failure signal. Stop rollout and inspect
worker state if one occurs. This local pass makes no deployment or physical acceptance claim.

## Evidence

Durable logs are under
`~/.local/state/pyxis-diagnostics/placement-sync-race/`:

- `verify.log` and `baseline-lint.log` record the final gate and clean-baseline exception.
- `scoped-gates.log` records typecheck, both test suites, build, and PWA checks.
- `owned-lint.log` records the scoped lint result.
- `verify-with-agent-deps.log` preserves the first full-gate result.
- `status.txt` records exit codes.

The original diagnostic scripts are `/tmp/pyxis-placement-handoff-repro.ts` and
`/tmp/pyxis-session-ack-probe.ts`. Durable source regressions live in `sync.test.ts`,
`database.test.ts`, and `proseql-engine.test.ts` under `clients/app/src/worker/`.
