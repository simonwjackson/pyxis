# Full-library startup: batch durable writes

## Implementation status

The worker now batches album persistence instead of saving the growing library after each
album. Local verification passes. The exact package build, deployment, and final production
browser measurements are pending at this commit.

The user approved this change after the diagnosis. Browser transport responsiveness and the
closed handoff report remain accepted. Sonos playback, queues, grouping, and volume are outside
this investigation. No such commands were issued.

## Reproduction

A fresh Chromium 146.0.7680.75 profile on production `c1d0e6e` took 82.857 seconds to reach
ready with 370 albums. Its first worker sync took 81.556 seconds. A profiled repeat took
85.281 seconds overall, including 83.628 seconds in worker sync. The library response took
38.739 ms in that repeat.

IndexedDB received 370 writes to the album file, totaling 317,913,044 serialized characters.
The pinned ProseQL worker flushes after each mutation. Each flush dumps, encodes, and saves the
complete collection. The existing application-level batch held one lock but still called
370 separate upserts.

The real WASM engine reproduced the cost with memory-backed Web Storage and no network or
disk writes. Applying the captured 370-album metadata took 87.865 seconds, with 87.779 seconds
inside album upserts. Disk latency alone therefore does not explain the delay.

## Change and failure contract

`WorkerEngine.batch` exposes a grouped persistence operation. The ProseQL adapter uses its
existing worker transaction API and adapts the transaction-owned collections. Calling the outer
FIFO facade from its own callback would deadlock, so the callback never uses those wrappers.
The memory engine has no persistence to group and runs the same operation against its collections.

A full album pull performs two ordered batches under the existing refreshed account-fenced
Web Lock. The first commits albums. The second updates offline relationships. Both finish
before the operation reports success. An album-file rejection cannot unpin the old library.

ProseQL does not commit separate files atomically. Tests reproduced albums committing while
pin or media files failed. The retry now repairs these relationships from retained album truth,
even when revisions already match or an album is already absent. Pin tombstone generations
remain stable on repeated repair. Shared media bytes are not removed by this operation.

Queued placements, newer local revisions, sequential duplicate-ID behavior, complete-body
replacement, startup-only fallback, durable cursors, and cross-tab refresh remain. Public RPC,
WorkerClient, storage paths, and worker schema 8 are unchanged. Session-only sync stays separate.

The cost is two engine transactions and an offline-relationship reconciliation pass. These add
work to unchanged full snapshots, but remove repeated whole-library encoding from changed
snapshots. Multi-file crash atomicity is still not provided. No timeout was widened and no
durable write was skipped.

## Local evidence

| Real-WASM measurement | Before | After |
|---|---:|---:|
| Apply the same 370-album snapshot | 87,865 ms | 680 ms |
| Album-file writes | 370 | 1 |
| Serialized characters written | 317,913,044 | 1,716,310 |
| Reopened album count | 370 | 370 |

These are storage-path measurements, not end-to-end browser timings. The unchanged-snapshot
measurement increased from 16 ms to 267 ms in these separate runs. Final browser measurements
must report warm startup as well as first startup.

Eight new real-WASM regression cases cover first/full replacement writes, durable reload,
unchanged replay, acknowledgement after both persistence phases, queued/newer records,
duplicate ordering, album rejection with an intact outbox, and three partial relationship
failure combinations. The original write-count test failed with 370 writes instead of one.
The relationship tests also failed before their recovery correction.

Scoped verification on the feature branch passed 256 client tests and 84 plugin/SDK tests.
Two credential-bearing Pandora fixture tests were skipped in the isolated worktree. Rust
unit/integration tests, formatting, Clippy, shellcheck, generated-contract checks, whole-repo
typecheck, owned-source Biome, and the production/PWA build passed. `just verify` ran but stopped
at unrelated prototype lint: 32 errors and 17 warnings. Aggregate tests use explicit Node 22.22.1.
Independent source review found no blocker; the parent also checked the actual Web Lock and
account-fence implementations rather than relying on the review's stated assumption.

Two initial CDP setup failures and an earlier run that paused service-worker initialization
are retained, not treated as passing baselines. The final baseline used no CPU or IndexedDB
profiler, but did retain request guards and worker-message timings. Its durable identity
survived reload. It had no active service-worker controller, so it is not offline/PWA acceptance.
A test setup initially read an old same-handle query result; corrected assertions reopen the
engine as the production lock does. A listen fixture was also corrected to include its required
contract fields before typecheck passed.

## Evidence and rollout

Private evidence lives at `~/.local/state/pyxis-diagnostics/startup-evidence/`. It includes
`diagnosis.md`, the guarded browser scripts and profiles, baseline/profile JSONL files,
`engine-scaling-corrected.jsonl`, `engine-after-batch.jsonl`, RED/GREEN logs,
`focused-gates-final.log`, `full-gates.log`, `default-verify.log`, and `batch-code-review.md`.
Captured account data and profiles are not committed. Printed evidence excludes bearer tokens.

Before deployment, build the exact committed revision and check that no live host or saved
output is playing. Keep the existing origin and schema. After deployment, repeat fresh and
warm startup, verify the exact bundle, all 370 albums, and stable identity. Stop diagnostics
without modifying user queues. Watch startup failures, persistence rejection, and resync
timeouts; restore the previous exact package if these regress.
