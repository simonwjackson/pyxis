---
id: task-024
title: Deepen album relationship policy for placement and Hot
status: To Do
priority: medium
labels:
  - architecture
  - library
  - placement
  - hot-signal
  - product-policy
created: 2026-06-01
source: se-architecture-improvement
---

# Deepen album relationship policy for placement and Hot

## Why it matters

Placement and Hot are core Pyxis product concepts, but behavior is split across small modules and hardcoded constants while the vision calls for configurable placement and listening-signal semantics.

## Acceptance Criteria

- [ ] Discovery, Collection, Archive, Dismissed, restore-from-dismissed, default visibility, and Hot computation are expressed through one album relationship/read-model policy seam.
- [ ] Hot window and minimum-listen heuristics are configurable through the established config/settings path instead of hardcoded constants only.
- [ ] Library list, album state resolution, hot shelf, and dismissed/hot edge cases are verified through public-contract tests around the policy seam.
- [ ] The seam leaves room for Weekly Mix, cache retention, neglect detection, and settings UI without changing core placement semantics.
- [ ] README/config documentation or the library placement brief is updated with the configurable policy behavior.

## Related

- `server/services/libraryAlbums.ts`
- `server/services/libraryPlacement.ts`
- `server/services/hotAlbums.ts`
- `server/rpc/services/library.ts`
- `src/db/config.ts`
- `docs/briefs/2026-04-09-library-placement-signals-brief.md`
- `VISION.md`

## Notes

Captured from architecture improvement scan. Candidate: deepen album placement + Hot into a configurable relationship policy.
