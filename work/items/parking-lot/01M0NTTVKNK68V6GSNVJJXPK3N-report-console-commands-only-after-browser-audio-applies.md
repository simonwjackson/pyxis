---
id: 01M0NTTVKNK68V6GSNVJJXPK3N
slug: report-console-commands-only-after-browser-audio-applies
title: Report console commands only after browser audio applies
origin: parked
status: To Do
priority: high
labels:
  - sessions
  - realtime
  - reference-client
created: 2026-08-22
source: se-code-review
context:
  cwd: /home/simonwjackson/code/github/simonwjackson/pyxis
  branch: main
  repo: pyxis
---

# Report console commands only after browser audio applies

## Why it matters

The reference host updates durable session state before the browser confirms that play, pause, stop, or seek reached the audio element. Autoplay or media failures can therefore leave the core reporting transport state that the renderer did not achieve.

## Acceptance Criteria

- [ ] A directed transport command changes core state only after the audio element confirms the action.
- [ ] Autoplay and media failures return an explicit host failure without leaving the session in Playing.
- [ ] Tests cover console Play when autoplay is refused and Pause during a stream load.

## Related

- `clients/app/src/reference/App.tsx`
- `clients/app/src/reference/ReferenceAudio.tsx`
- `docs/api/realtime.md`
- `work/items/active/20260821123211-pyxis-v2-rewrite/plan.md`
