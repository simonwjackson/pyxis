---
id: 01M1W0HN5JXHGDWCHV269DQZ40
slug: apply-placement-acknowledgements-and-pending-intent-under-on
title: Apply placement acknowledgements and pending intent under one lock
origin: parked
status: To Do
priority: high
labels:[]
created: 2026-09-06
source: se-work
---

# Apply placement acknowledgements and pending intent under one lock

## Why it matters

A deterministic current-code probe queued Archive after sync read the outbox but before replaceAlbum applied a Collection acknowledgement. The Archive outbox entry survived, but the visible stored album reverted to Collection and that sync report counted zero deferred writes. The existing stale-placement review card is therefore not fully resolved.

## Acceptance Criteria

- [ ] Reproduce the read-outbox/replace-album interleaving with a durable regression.
- [ ] Combine pending placement lookup and authoritative snapshot replacement into one account-fenced database operation; keep network I/O outside the lock.
- [ ] Preserve later queued placement intent in visible state and report remaining deferred work honestly.
- [ ] Verify ordering, D17 server-removal conflicts, retries, and account-switch fencing remain intact.

## Related

- `clients/app/src/worker/sync.ts`
- `clients/app/src/worker/database.ts`
- `clients/app/src/worker/entry.ts`
- `clients/app/src/worker/contract.ts`
- `clients/app/src/worker/sync.test.ts`

## Notes

2026-09-06 independent historical-card reconciliation reproduced via actual sync/openWorkerDatabase/createMemoryEngine and a scheduling proxy. No permanent outbox loss demonstrated. Inspect putServerSession for the analogous split-operation pattern during the focused fix; do not assume it is safe or broken without its own repro.
