---
date: 2026-04-15
topic: shared-primitives-react-audit
status: audited
---

# Shared Primitives React Audit

Scope:
- `src/web/shared/ui/`
- layout/navigation primitives in `src/web/shared/layout/`

Goal:
- Identify remaining drift from the compound-component guidance
- Separate true problems from acceptable leaf-component exceptions
- Avoid unnecessary refactors for simple primitives

## Summary

### Keep as-is
These are acceptable exceptions because they are leaf primitives, infrastructure primitives, or very small focused components without boolean-driven subtree composition problems.

- `src/web/shared/ui/button.tsx`
  - Leaf primitive
  - Variant/size props are styling concerns, not subtree-control booleans
  - No refactor needed

- `src/web/shared/ui/input.tsx`
  - Leaf primitive
  - No composition smell
  - No refactor needed

- `src/web/shared/ui/error-boundary.tsx`
  - Infrastructure primitive
  - Class boundary is required by React
  - Fallback prop is acceptable here
  - No refactor needed

- `src/web/shared/layout/sidebar.tsx`
  - Small navigation composition
  - No namespace compounds
  - No boolean subtree-control prop API
  - Current local branching is acceptable

- `src/web/shared/layout/mobile-nav.tsx`
  - Local open/close state is widget-local and appropriate
  - No external boolean subtree-control props
  - Current structure is acceptable for now

## Monitor, but do not refactor in this audit

- `src/web/shared/ui/editable-text.tsx`
  - This is a leaf primitive, but it now owns two interaction modes: display and inline edit
  - The `disabled` prop is acceptable here because it gates editing behavior rather than choosing unrelated render trees
  - If this grows further, refactor target would be:
    - `EditableTextRoot`
    - display/view compound
    - input/editor compound
  - For now: acceptable, but at the threshold where further feature growth should trigger decomposition

- `src/web/shared/ui/skeleton.tsx`
  - Contains multiple exports:
    - `Skeleton`
    - `StationListSkeleton`
    - `NowPlayingSkeleton`
  - This is structurally inconsistent with the one-component-per-file guideline
  - However, these are static presentational helpers with no behavioral branching and no namespace API
  - Keep for now; consider splitting only if more skeleton variants accumulate

## Issues found requiring no immediate code action

### Repeated nav filtering logic
Both:
- `src/web/shared/layout/mobile-nav.tsx`
- `src/web/shared/layout/sidebar.tsx`

repeat the `hasPandora` filtering logic for `navItems`.

Decision:
- Not a compound-component violation
- Do not refactor during this audit
- If nav behavior changes again, extract a shared `useVisibleNavItems()` helper

### EditableText interaction complexity
`EditableText` includes:
- long press to edit
- double click to edit
- blur save
- escape cancel
- local edit buffer

Decision:
- Still acceptable as a single focused primitive
- If validation, async save states, or richer editing modes are added, promote to a decomposed widget

## Audit result

This audit found **no additional must-fix shared primitive violations** beyond the major widget refactors already completed in earlier steps.

The remaining shared primitives fall into two buckets:
1. valid leaf/infrastructure exceptions
2. monitor-for-growth components that do not yet justify decomposition

## Recommended future trigger points

Refactor only if one of these happens:
- `EditableText` gains validation, async states, toolbar actions, or multi-field editing
- `Skeleton` gains several more domain-specific variants
- mobile/desktop nav gains role-based or capability-based variant trees beyond the current simple filtering
- button/input primitives start exposing behavior flags that select different subtrees rather than style variants
