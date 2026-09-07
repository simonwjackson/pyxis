# Full-library startup: batch durable writes

## Outcome

`dcf702ebdaaad4b8e6885b3c8963c3d5e46645f1` is integrated on `main` and deployed. The first
370-album startup measured 2.542 seconds, compared with 82.857 seconds before the change.
Warm reload measured 1.700 seconds and retained all albums and the same device identity.
A separate profiled run measured 2.600 seconds fresh and confirmed one album-file write.
No resync timeout or startup alert appeared in either deployed run.

This closes engineering follow-up `01M1VZ456T3R9EWQ1367WAFTWY` for the measured library.
Physical-device M3 acceptance and performance under severe I/O pressure remain separate.
These desktop Chromium samples are not a latency guarantee across devices.

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

## Measured results

| Guarded Chromium measurement | Before | Deployed |
|---|---:|---:|
| Fresh ready, without CPU/IndexedDB profiling | 82,857 ms | 2,542 ms |
| First worker sync in that run | 81,556 ms | 1,062 ms |
| Warm ready in that run | 2,029 ms | 1,700 ms |
| Fresh ready, with CPU/IndexedDB profiling | 85,281 ms | 2,600 ms |
| Album-file writes in profiled startup | 370 | 1 |
| Warm ready in profiled run | 2,629 ms | 1,945 ms |

The runs used Chromium 146.0.7680.75 and the same origin. Each fresh run used a new durable
profile. The scripts guarded RPC requests and measured worker messages. They never created
playback sessions or commanded transport, queue, grouping, or volume. Both deployed profiles
retained their device IDs and all 370 albums after a real navigation reload. The profiled
warm reload performed no album write. Pressure samples remain in each JSONL log; these short
runs do not reproduce the earlier severe-I/O-pressure workload.

The scripts reported no active service-worker controller. They prove the real dedicated worker,
WASM, IndexedDB, and durable reload, not new offline/PWA acceptance. A stale CDP worker session
ended during reload; the script recorded that and collected the replacement worker normally.

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

Scoped verification first passed 256 client tests and 84 plugin/SDK tests. After rebasing onto
the concurrent placement correction, all 261 client tests and 84 plugin/SDK tests passed.
Two credential-bearing Pandora fixture tests were skipped in the isolated worktree. Rust
unit/integration tests, formatting, Clippy, shellcheck, generated-contract checks, whole-repo
typecheck, owned-source Biome, and the production/PWA build passed. `just verify` ran but stopped
at 32 errors and 17 warnings: 29 prototype errors plus three formatting/import errors in an
auto-loaded `.pi/git` skill checkout. The earlier description of all 32 as prototype errors
was incorrect. Aggregate tests use explicit Node 22.22.1. No Fallow configuration exists.

Independent reviews of the original change and rebased integration found no blocker. The
rebase retained the placement-verdict fix and both test sets. Its only content conflict was
README prose, resolved by keeping both independent paragraphs. A later documentation-only
main commit required another rebase; comparison showed no runtime or test difference.
The exact final Nix package and host flake check passed. Other target systems were not checked.

Two initial CDP setup failures and an earlier run that paused service-worker initialization
are retained, not treated as passing baselines. The final baseline used no CPU or IndexedDB
profiler, but did retain request guards and worker-message timings. Its durable identity
survived reload. It had no active service-worker controller, so it is not offline/PWA acceptance.
A test setup initially read an old same-handle query result; corrected assertions reopen the
engine as the production lock does. A listen fixture was also corrected to include its required
contract fields before typecheck passed.

## Exact deployment and cleanup

The immutable deployment source and package are:

```text
git+file:///home/simonwjackson/code/github/simonwjackson/pyxis?ref=refs/heads/main&rev=dcf702ebdaaad4b8e6885b3c8963c3d5e46645f1
/nix/store/6jfrc5wlad9m7gjw5y1xgq1snn0az69p-pyxis-2.0.0
```

Profile entry `pyxis`, priority 11, replaced the verified `pyxis-1`, priority 10, on `c1d0e6e`.
The user core restarted at 2026-09-07 10:40:11 MDT. Read-only checks before installation and
immediately before restart found no active playback. The deployed executable was verified
through `/proc/<pid>/exe`. Both served bundles were byte-compared with the exact Nix client:
`assets/index-Ck2NfNNi.js` and `assets/entry-BAQPvUhH.js`.

Kitchen was already stopped and empty at revision 24 before this deployment. Living Room
was stopped and empty at revision 33. Their queues and revisions remained unchanged afterward.
Kitchen's earlier 9-track snapshot predates this run; no diagnostic restored or modified it.
Both rooms were reachable at the final read, which does not close their separate reliability
or physical-playback acceptance work.

The library retained the same 370 album IDs. Local and tailnet health returned 200. The media-only
LAN listener returned 404 for `/rpc`. All three user units were active. Diagnostic browsers
closed and created no playback sessions. No push, NixOS switch, shared Avahi restart, or plugin
configuration change occurred. The deployment also includes the independently landed
placement-verdict correction; this pass verified its combined tests, not a new live placement
mutation scenario.

## Evidence and monitoring

Private evidence lives at `~/.local/state/pyxis-diagnostics/startup-evidence/`. It includes
`diagnosis.md`, the guarded browser scripts and profiles, baseline/profile JSONL files,
`engine-scaling-corrected.jsonl`, `engine-after-batch.jsonl`, RED/GREEN logs,
`focused-gates-final.log`, `full-gates.log`, `rebased-full-gates.log`, `default-verify.log`,
`batch-code-review.md`, `rebase-review.md`, `exact-package.json`, `exact-flake-check.log`,
`deploy.log`, and `deployment-verified.json`. Browser results are
`deployed-2026-09-07T16-40-49-980Z.jsonl` and
`deployed-profile-2026-09-07T16-41-46-633Z.jsonl`.
Captured account data and profiles are not committed. Printed evidence excludes bearer tokens.

Watch startup failures, persistence rejection, and resync timeouts. The previous exact package
is `/nix/store/nbhaarswfzi6cg6bzr704ymk8jxx3cr7-pyxis-2.0.0` from `c1d0e6e`. If these regress,
inspect read-only state and restore the previous package after checking active playback.
Do not clear user storage to hide a failure. Schema and origin remain unchanged.
