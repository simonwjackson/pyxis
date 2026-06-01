---
id: task-014
title: Make the default Lattice verification gate green
status: To Do
priority: high
labels:
  - lattice
  - tooling
  - tests
created: 2026-06-01
source: user
---

# Make the default Lattice verification gate green

## Why it matters

Pyxis cannot honestly claim full Lattice alignment while the documented completion gate (`just test-unit`) fails. A green, trustworthy gate is the foundation for safe future Effect/runtime work.

## Acceptance Criteria

- [ ] `just test-unit` passes without relying on known-failure exceptions.
- [ ] Pandora fixture/auth replay tests are either fixed or moved behind an explicitly named non-default integration/live-provider command.
- [ ] `README.md` and `AGENTS.md` document the default verification gate accurately.
- [ ] No product runtime behavior changes are introduced solely to satisfy tests.

## Related

- `src/sources/pandora/**/*.test.ts`
- `src/sources/pandora/fixtures/**`
- `justfile`
- `package.json`
- `README.md`
- `AGENTS.md`

## Notes

Current full unit run fails with the Pandora fixture/auth cluster (734 pass / 127 fail at last check).
