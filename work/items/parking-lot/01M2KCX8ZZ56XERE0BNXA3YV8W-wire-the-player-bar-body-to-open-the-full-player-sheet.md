---
id: 01M2KCX8ZZ56XERE0BNXA3YV8W
slug: wire-the-player-bar-body-to-open-the-full-player-sheet
title: Wire the player bar body to open the full player sheet
origin: parked
status: To Do
priority: medium
labels:
  - player
  - ui
created: 2026-09-15
source: se-work
---

# Wire the player bar body to open the full player sheet

## Why it matters

`PlayerSheet` exists, is tested, and carries the scrubber, elapsed and remaining that the bar deliberately does not. Nothing can reach it: `App.binding.tsx` passes no `onOpenPlayer`, so `Bar` renders its body as a plain div and the whole player is unreachable from the product. The bar body is the standard way in (tapping a mini bar opens the player in every shipped music app), and it is also the only route to seek until the bar's own position rule becomes interactive.

## Acceptance Criteria

- [ ] Tapping anywhere on the bar body opens PlayerSheet for the sounding album
- [ ] The cover and copy remain one tap target with no nested button
- [ ] Escape and the close control both close the sheet and return focus to the bar
- [ ] A test asserts the sheet opens and closes from the bar

## Related

- `clients/player/src/bindings/App.binding.tsx`
- `clients/player/src/shapes/PlayerSheet.tsx`
- `clients/player/src/shapes/NowBarPlaying.tsx`
- `docs/design/player-plan.md`
