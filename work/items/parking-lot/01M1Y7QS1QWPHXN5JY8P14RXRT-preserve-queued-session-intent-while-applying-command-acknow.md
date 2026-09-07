---
id: 01M1Y7QS1QWPHXN5JY8P14RXRT
slug: preserve-queued-session-intent-while-applying-command-acknow
title: Preserve queued session intent while applying command acknowledgements
origin: parked
status: To Do
priority: medium
labels:
  - sync
  - session
created: 2026-09-07
source: se-work
context:
  cwd: .worktree/placement-sync-race
  branch: fix/placement-sync-race
  commit: 69432ce
  repo: simonwjackson/pyxis
  invoked_by: se-work
---

# Preserve queued session intent while applying command acknowledgements

## Why it matters

The independent session probe reproduces the placement race's analogue on main 69432ce: queue.add for a second track completes between putServerSession reading pending commands and replaceSession applying the first acknowledgement. The visible queue falls from [first, second] to [first] while the second command remains in the outbox. No permanent outbox loss or physical playback failure was demonstrated. This needs its own session-command regression and fix without widening the approved album-placement change.

## Acceptance Criteria

- [ ] Add a deterministic regression using real sync, database, and lock behavior for a command queued during acknowledgement.
- [ ] Apply pending session commands and the authoritative session verdict under one account-fenced database operation, with network I/O outside the lock.
- [ ] Preserve command receipts, optimistic fingerprints, ordered replay, renderer confirmation, and account-switch rejection.
- [ ] Verify the later queued command stays visible and replays once.

## Related

- `clients/app/src/worker/sync.ts`
- `clients/app/src/worker/database.ts`
- `clients/app/src/worker/session-local.ts`
- `clients/app/src/worker/sync.test.ts`
- `work/items/active/20260821123211-pyxis-v2-rewrite/plan.md`

## Notes

2026-09-07: /tmp/pyxis-session-ack-probe.ts is a local Nix-shebang probe with a scheduling Proxy and configured WorkerRpc. It used main 69432ce with no service access. Expected [first,second], observed [first], one remaining session.command. The album fix does not modify putServerSession. The old deferred-zero result is independently corrected by the album fix's final outbox count.
