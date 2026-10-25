# Pyxamp support: wire v3 update fence

Workflow `8145e018`. U34–U37 extend the existing rewrite. This is not another rewrite.
No deployment, profile switch, push, live mutation or physical Sonos command was performed.

## Wire identity

The wire ID is `pyxis-rpc-v3`. `services/pyxis/src/rpc/contract.rs` owns it.
`services/pyxis/generate-contracts.sh` generates the TypeScript `RPC_CONTRACT_ID`, types
and JSON Schema. `--check` checks all three. Do not edit generated files.

Authenticated HTTP callers must send `x-pyxis-contract: pyxis-rpc-v3`. A missing or
mismatched ID returns retryable `contract.mismatch` before old commands are decoded.
The public status and device claim/pair calls remain available for discovery.
Realtime hello also carries `contractId`. A missing/mismatched hello cannot register a
playback host. Both web clients reject a mismatched welcome before granting control
or storing its cursor. Reload all old tabs after a coordinated update.

## Pending intent is a deployment blocker

A current-v2 `queue.shuffle` command is a one-shot mutation. `shuffle.set` is a persistent
mode. Replacing one with the other changes intent and also conflicts with the existing
content-bound command receipt. No automatic translation or discard is safe.

The new worker preserves an old pending entry unchanged, reports a specific blocker and
stops session-command replay at that entry. It does not send it, dequeue it, or fabricate
a receipt. This includes a saved settlement attached to that entry. The core's retryable
version error also protects old cached workers that reconnect before their UI updates.
Such workers may describe this as offline; the important invariant is retained intent.

Before deployment:

1. Keep the matching v2 service and client available at the existing origin.
2. Open each device's existing v2 store and drain pending writes. Confirm zero deferred
   session commands on every device, including devices that were offline.
3. Close old clients, update service and both web clients together, then reopen them.
4. Confirm v3 hello and fresh authoritative snapshots before using console controls.

This stage did not inspect live outboxes. The inventory and drain are **not verified**.
If any old pending entry exists, deployment remains blocked. Do not clear site storage,
reset the database, reuse its command ID, or translate it into a new mode command.
Do not roll a store containing new v3 pending commands back to v2 without a separate
reviewed recovery plan. Keep all durable records intact.

## Persisted current-rewrite records

Old current-v2 session records reopen with repeat `off`, shuffle `false`, and their existing
queue/cursor/position unchanged. Occurrence order defaults to queue order. This is a current
rewrite field default, not a v1 reader. Album tags default to an empty list. Worker schema 8
stores opaque session/album bodies, so no destructive schema reset or version bump is needed.
The worker applies session defaults at its read boundary and retains old outbox bodies.

## Playback and library behavior

- `queueOrder` carries one original ordinal per effective queue occurrence. Sorting those
  ordinals restores original order. Equal track IDs remain separate occurrences. Toggles
  preserve the current occurrence, position and duration. Edits preserve ordinal identity
  while present. Clear removes all occurrences but retains the user's playback modes.
- Shuffle uses the same session-seeded deterministic permutation in core and worker. This
  avoids random replay changing an already-confirmed queue. Enabling shuffle affects the
  future suffix, not the current/past occurrences. New additions join the future permutation.
- Repeat-one restarts at natural end. Repeat-all advances and wraps. Off ends. Explicit
  cursor jumps are not trapped by repeat-one; the product's explicit skips wrap only for all.
- The shared browser host confirms the next/repeated renderer play before writing the
  natural-end transition. The core-hosted output adapter uses prepared commands, durable
  receipts, renderer position/stream confirmation and rollback. The speaker does not own a
  second native queue or repeat state. Physical Sonos acceptance remains unverified.
- An unloaded browser track refuses seek. A loaded renderer must have a known duration.
  Native Sonos seek is whole-second; confirmation tolerates 1000 ms and reports actual time.
  Browser reservations and prepared output receipts retain the original seek revision across
  retries and core restart. Output preparation rejects a stale or unfenced unapplied seek
  before renderer effects; commit rechecks the revision before publishing confirmation.
  Applied receipts remain effect-free replays. After a session change, a fresh seek gesture
  needs a new command ID.
- Group first pages observe current membership. Continuations retain an immutable snapshot
  for up to 30 minutes with a bounded 512-cursor store. List and first-page calls can observe
  intervening edits. Partial station failures omit count and carry typed source failures.
- Tags are account-owned, normalized trim/lowercase, sorted/deduplicated, limited to 64
  labels of 64 characters, and retained through placement updates and offline snapshots.
- Playlist append preserves ordered duplicates and atomically commits a content-bound receipt
  and revision. Rename, delete and reorder are not added.

## Verification ownership

Each unit ran focused service, public RPC, worker/shared-host and relevant product checks.
Isolated plugin/SOAP fixtures stand in for external renderers through the real contracts.
They are not physical playback evidence. Final focused checks pass: 68 Rust cases,
208 app/worker cases, 87 product cases, codegen drift, library Clippy, Rust formatting,
root/product/new-reference TypeScript checks, owned Biome and changed-shell checks.
Native Chromium passes real seek/receipt ordering, duplicate-order restoration and repeat-one
at natural end with zero forbidden network requests. A fresh isolated HTTP process reports
v3, zero plugins, 10 groups, one tagged album, two duplicate playlist tracks and a 5000 ms seek.
The parent runs `just verify` and the separate
product tests, typecheck and gates once on the completed branch. No flake-wide check is used.

## Parent build-gate repairs

The parent run on `6548f50` reached 356 passing app cases and one output-control failure.
The fixture lacked a seekable current track/duration, while the older assertion expected
all reachable controls to be enabled. It also inspected each button's own disabled property,
not effective disabling inherited from a fieldset. The revised regression keeps stable-row
and no-command assertions, supplies a seekable Kitchen and an empty Living Room, and checks
effective disabling for all mode/seek controls. Five focused capability cases cover known,
missing and zero durations, missing tracks, and unreachable hosts. The zero-duration case
exposed and corrected a real enabled-Seek gap. Seven selected tests and static checks pass.

The player run passed 278 unit cases and 12 architecture meta-tests, then the architecture
audit rejected the new transport import from `app/src/rpc/validation`. The same unchanged
checker accepts that file at base `a3be14a`. Pure schema validation now belongs to
`contracts/validation.ts`, not either client's state-edge namespace. Both clients consume
it directly. Its pinned Ajv dependency moved to the root package; lock and closure metadata
were regenerated. No architecture rule, exception or coverage was changed. Generated
contracts are unchanged. Twenty-three selected app cases, twelve product transport cases,
twelve architecture meta-tests, both architecture audits, related typechecks and owned
Biome pass. No full verification was rerun by the worker for these fixes. The parent then
confirmed `just verify` at `a0b1e7b`, including 362 app cases and the reference build/PWA gate.
The separate player gates also passed on that SHA. Eighteen existing Biome warnings remain.

## Contract review, round 1: output seek receipts

The browser reservation fence did not cover the separate output preparation path. A failed
renderer confirmation left an unapplied output receipt without an expected revision. Retrying
its ID after selecting another track could seek the new track. Two isolated authenticated RPC
regressions reproduced this on the unchanged `a0b1e7b` production code: both the running-core
and reopened-core cases returned `dispatched` and sent a third seek after B was loaded, instead
of retaining the two original failed-seek/rollback calls.

Output preparation now persists its original revision before returning renderer work. It
refuses stale or unfenced unapplied seek receipts without sending a seek. Commit also fences
late confirmations. The regressions use the actual router, durable store, local media and a
configured plugin subprocess. They check no seek or snapshot change on stale retry, successful
fresh-ID seek on B, and effect-free applied replay after a track change. Both pending and
applied receipts reopen from disk in the restart case. Domain cases cover repeated preparation
at the original revision, a changed revision before commit, and an interrupted unfenced receipt.

Twenty focused Rust cases pass across `output_seek_rpc`, `output_rpc`, `sessions` and
`session_snapshots`. Related compilation/Clippy, Rust formatting and diff checks pass.
No physical Sonos, live service, provider mutation, deployment or full verification is involved.
The parent owns the final combined review-stage gates. Evidence is in
`/tmp/pyxamp-wf8145-evidence/review-repairs/pyxis-output-seek`.
