# Local sync settlement

Local verification passes for the changed worker code. Deployment is pending.

## Reproduced failure

After the server accepted `queue.add`, a configured local verdict write failed.
Sync restored the old empty queue, removed the outbox entry and reported rejection.
The regression fails on that behavior and passes with local settlement.

Two independent reviews found further failures. Receipt persistence after projection
allowed redelivery to duplicate a pending track. Permanent rejection text `auth` or
`network` changed transport status. All three regressions fail before their fixes and pass
afterward. Multiple saved acceptances also have regressions for available and failed pulls.
Final independent review found no correctness blocker. A further real-WASM test covers
durable dequeue followed by failure; reopen finds completed state and no pending row.

## Change

`WorkerDatabase.settleOutbox` owns local completion for session commands, placements and
listens. `sync-settlement.ts` stages the complete verdict on the existing outbox row, applies
state, appends a deduplicated notice and dequeues last. The method runs under one refreshed,
account-fenced lock. RPC calls remain outside that lock.

Storage failure retains recovery evidence and returns a deferred storage result. It does
not become server rejection or network outage. A saved verdict resumes without repeating
RPC. A fresh snapshot or a newer saved authoritative verdict supplies the projection base.
Replay excludes terminal staged commands and retains unsettled intent in order. Invalid
pending commands retain the existing stop-at-first-invalid rule.

Missing replay receipts persist before the changed session projection. The journal repairs
a later projection failure. Real ProseQL WASM tests close and reopen durable storage after
configured failures before and after staging, projection, notice and dequeue writes.
A separate reopen test verifies receipt recovery and duplicate-free redelivery.

Historical conflict and rejection notices retain their deterministic IDs and newest-100
bound. Settlement outcomes have variant-specific payloads. Schema 8, conflict policy and
command/listen IDs remain unchanged. Generated contracts and UI code did not change.

## Verification

| Gate | Result |
| --- | --- |
| Reference client and worker Vitest | 19 files, 300 tests passed. |
| Player Vitest | 23 files, 270 tests passed. |
| Plugin/SDK Bun tests | 115 passed, 1 skipped. |
| Worker Biome | 26 files passed. |
| Player TypeScript | Passed. |
| Reference and player builds | Passed. |
| Native Chromium playback fixture | Passed. Decoded audio advances, outbox is empty, and loads are only `latest-saved` and `latest-choice`. No live RPC or stream requests. |
| Clippy, shell lint, generated contract check | Passed. |
| `just verify` | Failed at inherited Rust formatting in `sessions/machine.rs:84`. Pristine `be27649` fails identically. |
| Whole-repository TypeScript | Failed only at the inherited `get-color.jpg` declaration. Output matches pristine `be27649` exactly. |
| Whole-repository Biome | 30 errors and 18 warnings, matching pristine `be27649`. Owned files pass. |
| `cargo test --all --no-fail-fast` | 206 passed, 1 failed. The date-dependent `listen_rpc` hot-album assertion also fails on pristine `be27649`. |

`just format` ran. Its unrelated changes were restored. The verification script reports
unexpected failures separately; its exit status does not claim that full repository gates pass.
Local logs and scripts are in `~/.local/state/pyxis-diagnostics/local-sync-settlement-20261001/`.

## Cost and limits

Each verdict adds a durable outbox save. Separate persistence files are not crash-atomic.
If that first save fails after a placement RPC, retry retains intent but cannot guarantee
its original conflict details. Closing this window needs a pre-request decision record or
server receipts. The plan records it as separate work.

This change does not address realtime ordering or renderer confirmation. The browser check
is not physical phone acceptance. No Sonos playback, queue, grouping or volume command ran.
