---
id: task-015
title: Update stale architecture docs to Effect RPC and atoms
status: To Do
priority: high
labels:
  - lattice
  - docs
  - architecture
created: 2026-06-01
source: user
---

# Update stale architecture docs to Effect RPC and atoms

## Why it matters

Several durable docs still describe the active architecture as tRPC/React Query. That creates recurring agent/human drift after the big-bang cutover.

## Acceptance Criteria

- [ ] Current top-level docs describe Effect RPC, Effect Schema, Effect services/layers, and Effect atoms as the active architecture.
- [ ] Stale tRPC/React Query references in current operational docs are removed or explicitly marked historical/superseded.
- [ ] Older plans that remain historical are clearly superseded where they would otherwise guide current work.
- [ ] Log/debugging guidance no longer labels server logs as tRPC-specific.

## Related

- `README.md`
- `VISION.md`
- `AGENTS.md`
- `CLAUDE.md`
- `ARCHITECTURE.md`
- `docs/operations/**`
- `docs/plans/2026-05-24-001-refactor-effect-rpc-migration-plan.md`
- `docs/plans/2026-05-25-003-refactor-effect-runtime-big-bang-plan.md`
