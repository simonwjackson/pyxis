---
id: task-021
title: Deepen browser playback into a testable runtime seam
status: To Do
priority: high
labels:
  - architecture
  - playback
  - react
  - effect-atoms
created: 2026-06-01
source: se-architecture-improvement
---

# Deepen browser playback into a testable runtime seam

## Why it matters

Playback currently concentrates DOM audio lifecycle, server-state reconciliation, Effect atom subscriptions, optimistic commands, progress reporting, and logging in one hook, making pause/resume and reconnect regressions expensive to reason about.

## Acceptance Criteria

- [ ] Server player state to browser-audio action reconciliation is factored into a pure, directly unit-tested policy.
- [ ] Browser `HTMLAudioElement` operations sit behind a small adapter seam while `PlaybackContext` keeps its public contract stable.
- [ ] Tests cover first snapshot behavior, reconnect, pause/resume, same-track progress sync, new stream URL transitions, and audio error reporting through public behavior.
- [ ] Durable playback documentation records browser/server ownership and the rationale for the seam.

## Related

- `src/web/shared/playback/usePlayback.ts`
- `src/web/shared/playback/playerAtoms.ts`
- `src/web/shared/playback/PlaybackContext.tsx`
- `server/services/player.ts`
- `docs/solutions/ui-bugs/pause-resume-restarts-song-playback-20260210.md`

## Notes

Captured from architecture improvement scan. Candidate: deepen browser playback into a testable runtime seam.
