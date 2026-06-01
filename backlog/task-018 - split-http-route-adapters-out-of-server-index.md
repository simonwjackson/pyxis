---
id: task-018
title: Split HTTP route adapters out of server index
status: To Do
priority: medium
labels:
  - lattice
  - http
  - architecture
created: 2026-06-01
source: user
---

# Split HTTP route adapters out of server index

## Why it matters

`server/index.ts` remains a high-complexity composition point owning route ordering, CORS, stream decoding, stale `/trpc`, static/Vite fallback, Android bridge, and error mapping. Lattice-aligned route contracts should be easier to test and reason about.

## Acceptance Criteria

- [ ] `server/index.ts` is reduced to configuration, server startup, and route composition.
- [ ] Separate route adapters own `/rpc`, `/stream`, Android bridge, health, stale `/trpc`, and static/Vite fallback behavior.
- [ ] Route-order, CORS, stale `/trpc`, stream range/error, and dev/static fallback behavior are covered by public HTTP tests.
- [ ] No change to `/stream/:compositeTrackId` byte-range behavior.

## Related

- `server/index.ts`
- `server/rpc/http.ts`
- `server/services/stream.ts`
- `server/lib/health.ts`
- `server/lib/androidMediaBridge.ts`
- `tests/e2e/app-shell.e2e.ts`
