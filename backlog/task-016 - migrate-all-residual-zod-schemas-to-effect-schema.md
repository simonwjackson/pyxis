---
id: task-016
title: Migrate all residual Zod schemas to Effect Schema
status: To Do
priority: high
labels:
  - lattice
  - effect-schema
  - runtime
created: 2026-06-01
source: user
---

# Migrate all residual Zod schemas to Effect Schema

## Why it matters

The user clarified Pyxis needs to move over completely to Effect Schema. Keeping Zod for config/provider validation preserves a second schema language and weakens the Lattice runtime model.

## Acceptance Criteria

- [ ] No runtime source file imports `zod`.
- [ ] `package.json`, `bun.lock`, and `bun.nix` no longer include Zod unless an unavoidable transitive dependency remains.
- [ ] `src/config.ts` uses Effect Schema for layered config defaults, validation, and inferred `AppConfig`.
- [ ] Provider response schemas under metadata/source modules use Effect Schema or a documented Effect-native decoder seam.
- [ ] Negative validation tests cover migrated config and provider schema invariants.
- [ ] `just typecheck`, targeted migrated tests, and `just test-unit` pass or the remaining failures are unrelated and separately tracked.

## Related

- `src/config.ts`
- `src/config.test.ts`
- `src/sources/bandcamp/schemas.ts`
- `src/sources/deezer/schemas.ts`
- `src/sources/discogs/schemas.ts`
- `src/sources/musicbrainz/schemas.ts`
- `src/sources/soundcloud/schemas.ts`
- `package.json`
- `bun.lock`
- `bun.nix`

## Notes

This replaces the earlier softer option of documenting Zod as a temporary non-API exception.
