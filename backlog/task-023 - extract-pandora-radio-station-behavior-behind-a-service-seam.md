---
id: task-023
title: Extract Pandora radio station behavior behind a service seam
status: To Do
priority: medium
labels:
  - architecture
  - effect-services
  - radio
  - pandora
  - rpc
created: 2026-06-01
source: se-architecture-improvement
---

# Extract Pandora radio station behavior behind a service seam

## Why it matters

Radio RPC handlers currently contain Pandora station lifecycle orchestration, token parsing, station/seed/feedback encoding, playlist item registration, and loosely typed command successes, making the station discovery domain hard to test outside the transport boundary.

## Acceptance Criteria

- [ ] A radio/station service owns Pandora station lifecycle behavior and exposes typed Pyxis station results to RPC handlers.
- [ ] RPC handlers become schema boundary glue for station list/detail/tracks/create/delete/rename/QuickMix/seed commands.
- [ ] Command success contracts are typed rather than `Schema.Unknown` where the UI or callers rely on outcomes.
- [ ] Service-level tests cover station detail encoding, seed add/remove, station track registration, QuickMix, and auth retry behavior.
- [ ] Station terminology and service ownership are documented in the project architecture or a feature-pattern note.

## Related

- `server/rpc/handlers/radio.ts`
- `server/rpc/handlers/track.ts`
- `src/api/contracts/radio.ts`
- `src/api/rpc.ts`
- `src/sources/pandora/client.ts`
- `VISION.md`
- `backlog/task-017 - deepen-effect-service-layers-beyond-singleton-wrappers.md`

## Notes

Captured from architecture improvement scan. Candidate: pull Pandora radio station behavior out of RPC handlers.
