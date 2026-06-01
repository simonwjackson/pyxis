---
id: task-017
title: Deepen Effect service layers beyond singleton wrappers
status: To Do
priority: medium
labels:
  - lattice
  - effect-services
  - architecture
created: 2026-06-01
source: user
---

# Deepen Effect service layers beyond singleton wrappers

## Why it matters

The current Effect services safely wrap module singletons, but the seam is still shallow: RPC, Android bridge, auto-login, and stream-adjacent behavior share state partly by convention and direct singleton imports.

## Acceptance Criteria

- [ ] Player, queue, source/session, and library authority are exposed through deeper service interfaces consumed by RPC and adjacent HTTP bridges where practical.
- [ ] Android media bridge and Effect RPC behavior are proven to observe the same player/queue authority through public-contract tests.
- [ ] Singleton-backed compatibility is either removed or documented as an intentional transitional adapter.
- [ ] Service tests verify behavior through service contracts rather than private singleton implementation details.

## Related

- `server/rpc/services/*.ts`
- `server/services/player.ts`
- `server/services/queue.ts`
- `server/services/sourceManager.ts`
- `server/services/autoLogin.ts`
- `server/lib/androidMediaBridge.ts`
- `server/rpc/handlers/player.ts`
- `server/rpc/handlers/queue.ts`
