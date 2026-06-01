---
id: task-025
title: Restore typecheck for Storybook *.stories.tsx files
status: To Do
priority: high
labels:
  - lattice
  - tooling
  - typescript
  - storybook
created: 2026-06-01
source: se-work
---

# Restore typecheck for Storybook *.stories.tsx files

## Why it matters

`just typecheck` (web project) fails on `Cannot find module '@storybook/react-vite'` across 4 story files. Pre-existing on `main` as of task-014. Either install `@storybook/react-vite` types, exclude story files from `tsconfig.web.json`, or migrate story imports to a package that is resolvable. Leaving it broken means the documented verification gate cannot include typecheck.

## Acceptance Criteria

- [ ] `just typecheck` exits 0 on `main`.
- [ ] Story files either typecheck successfully or are explicitly excluded from `tsconfig.web.json` with a documented reason.
- [ ] README/AGENTS verification section can claim `just typecheck` as part of the gate.

## Related

- `src/web/shared/ui/Button.stories.tsx`
- `src/web/shared/ui/Feedback.stories.tsx`
- `src/web/shared/ui/Input.stories.tsx`
- `src/web/shared/ui/collection-grid/CollectionGridSkeleton.stories.tsx`
- `tsconfig.web.json`
- `package.json`
