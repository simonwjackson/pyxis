---
id: task-026
title: Stabilize player stale-progress unit test
status: To Do
priority: medium
labels:
  - tests
  - playback
  - flake
created: 2026-06-01
source: se-work
---

# Stabilize player stale-progress unit test

## Why it matters

During task-016 verification, `just test-unit` failed once in `player.progress.report (stale guard)` because progress was `0.001` instead of `0`, then passed targeted and on full rerun. This suggests an order/timer-sensitive test around player singleton progress rather than a schema migration regression. Flaky verification gates erode trust even when reruns pass.

## Acceptance Criteria

- [ ] `server/rpc/handlers/player.test.ts` stale progress guard passes reliably across repeated full `just test-unit` runs.
- [ ] The test controls time/progress deterministically or resets singleton state so previous timing cannot leak in.
- [ ] No product playback behavior is changed solely to hide the flake.

## Related

- `server/rpc/handlers/player.test.ts`
- `server/services/player.ts`
