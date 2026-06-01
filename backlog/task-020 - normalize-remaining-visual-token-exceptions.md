---
id: task-020
title: Normalize remaining visual token exceptions
status: To Do
priority: medium
labels:
  - lattice
  - visual
  - ui
created: 2026-06-01
source: user
---

# Normalize remaining visual token exceptions

## Why it matters

Full Lattice visual alignment requires named tokens and fluid scale usage. Remaining arbitrary values, inline styles, and raw colors should either become tokens or be isolated as deliberate sandbox/prototype exceptions.

## Acceptance Criteria

- [ ] Production UI has no avoidable Tailwind arbitrary values, raw hex colors, or inline style values that bypass the theme scale.
- [ ] Missing scale steps are added to theme/CSS tokens and used by name.
- [ ] Dynamic inline styles that are truly runtime-calculated are documented or isolated behind a small component/seam.
- [ ] Sandbox/prototype-only exceptions are clearly isolated and do not define production UI patterns.
- [ ] Visual verification via Storybook or screenshots covers affected surfaces.

## Related

- `src/web/index.css`
- `src/web/shared/layout/**`
- `src/web/shared/ui/**`
- `src/web/features/sandbox/QueueCoverflow/**`
