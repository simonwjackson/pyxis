---
id: 01M2KCX9016VMDN9X5DPCNYSFX
slug: make-the-bar-s-position-rule-seekable
title: "Make the bar's position rule seekable"
origin: parked
status: To Do
priority: medium
labels:
  - player
  - ui
  - playback
created: 2026-09-15
source: se-work
---

# Make the bar's position rule seekable

## Why it matters

The bar draws a 3px position rule but offers no way to move within a track; seeking lives only in the unreachable PlayerSheet. A drag across the bar should mean the full length of the track, proportional to the container, so the same physical motion means the same thing at every size. Needs a range input or pointer handling on the rule, a visible thumb, and a decision about whether dragging scrubs optimistically while the renderer catches up.

## Acceptance Criteria

- [ ] Dragging across the rule seeks proportionally: the far right edge is the end of the track
- [ ] Keyboard arrows on the focused rule move the position
- [ ] A drag that ends mid-request leaves the position where the person put it, not where the old report said
- [ ] Unit tests cover the fraction-to-position conversion

## Related

- `clients/player/src/system-next/Progress.tsx`
- `clients/player/src/system-next/Bar.tsx`
- `docs/design/player-plan.md`
