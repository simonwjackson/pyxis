---
title: "feat: Align Pyxis as Caliper's first external consumer"
type: feat
status: active
date: 2026-07-04
origin: caliper/work/items/active/20260704190231-caliper-extraction-and-pyxis-alignment/plan.md
verify_command: "just typecheck && just test-unit"
---

# feat: Align Pyxis as Caliper's first external consumer

## Summary

Make Pyxis mountable by Caliper without simulating screens: extract `mountPyxis`, expose a real registry bridge and injectable router history, add real per-state source-layer edges, define Pyxis device/knob config, and create a `pyxisLabSurfaceAdapter` that renders real Pyxis surfaces at true size.

## Requirements

- R6. Pyxis mounts as a Caliper surface: `mountPyxis(host, { data, navigation, onRegistry })` exists and production boot is unchanged.
- R7. Pyxis exposes real per-state source-layer edges the lab can pin (Ready / Empty / LoadError / Defect), not component-prop state injection.
- R8. Pyxis provides a device/knob config with NW-A306 as hero device and a CSS-var intrinsic-scaling recipe.
- R9. `pyxisLabSurfaceAdapter` renders real Pyxis surfaces at true physical size with axes derived from real state-machine tags.

## Scope Boundaries

- Do not redesign the Pyxis product shell or choose the final Walkman UI face.
- Do not build new placement/Hot/playback product behavior.
- Do not touch the user's dirty main checkout; this plan executes in the dedicated pyxis worktree.

## Implementation Units

### U7. Extract `mountPyxis` with injectable router history and a registry bridge

**Goal:** Make Pyxis mountable into an arbitrary host with injected history and a registry bridge, production boot unchanged.

**Files:**
- Create: `src/web/mountPyxis.tsx`, `src/web/router.ts`, `src/web/PyxisRegistryBridge.tsx`
- Modify: `src/web/main.tsx`
- Test: `src/web/mountPyxis.test.tsx`

**Execution note:** Start with a failing test that `mountPyxis` renders into a detached host and reports a registry via `onRegistry`.

**Patterns to follow:** caliper/korri `product/surfaces/web/shift/mount-shift.tsx`; existing Pyxis `src/web/main.tsx`, `src/web/routes/+__root.tsx`.

**Verification:** production boot composition unchanged; test and typecheck green.

### U8. Real per-state source-layer edge

**Goal:** Give Pyxis a real edge the lab can pin to fixture states, replacing prop-injected story state for Home / placement + Hot.

**Files:**
- Create: `src/web/shared/api/inMemoryProtocol.ts`
- Create if needed: `src/web/features/home/homeSourceLayer.ts`
- Modify: `src/web/features/home/*`
- Test: `src/web/shared/api/inMemoryProtocol.test.ts`, `src/web/features/home/HomeState.edge.test.ts`

**Verification:** Home renders Ready / Empty / LoadError / Defect by swapping a real source atom.

### U9. Pyxis device roster and intrinsic-scaling config

**Goal:** Add NW-A306 hero device plus knobs mapped to CSS variables read by real `index.css`.

**Files:**
- Create: `src/web/caliper/pyxisConfig.ts`
- Modify: `src/web/index.css`

**Verification:** knobs cascade into app CSS with `var(--x, fallback)` fallbacks.

### U10. Pyxis Caliper surface adapter and dev entry

**Goal:** `pyxisLabSurfaceAdapter` renders real Pyxis screens through Caliper.

**Files:**
- Create: `src/web/caliper/pyxis-adapter.ts`, `src/web/caliper/pyxis-axes.ts`, `src/web/caliper/pyxis-seed.ts`, `src/web/caliper/main.tsx`, `src/web/caliper/index.html`, `src/web/caliper/vite.config.mjs`
- Modify: `package.json`, `justfile`
- Test: `src/web/caliper/pyxis-adapter.test.ts`

**Verification:** `just dev-lab` renders real Pyxis surfaces in Caliper frames.
