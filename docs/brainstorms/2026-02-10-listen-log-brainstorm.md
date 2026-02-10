# Listen Log Brainstorm

**Date:** 2026-02-10
**Status:** Ready for planning

## What We're Building

An append-only listen log that records every song played for 30+ seconds. Server-side recording at track transition points, with denormalized storage (each row contains full track info + timestamp). API and UI only for now — no external scrobbling.

## Why This Approach

**Server-side recording in the player service** was chosen over client-reported or hybrid approaches because:

- All logic lives in one place (player service track transitions)
- Can't be bypassed or missed due to client disconnects
- No client changes needed for the recording itself
- ~5s resolution from `reportProgress()` is more than adequate for a 30s threshold

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Record trigger | After 30s threshold | Industry standard; filters accidental plays while capturing intentional listens |
| Storage model | Denormalized | Each row stores title, artist, source directly. Simpler queries, no joins, resilient to metadata changes |
| Recording location | Server-side player service | Single source of truth, hooks into existing track transition points |
| Data per entry | Minimal: track info + timestamp | Title, artist, album, source, composite track ID, listened_at |
| Scope | API + UI | No external service integration for now |

## Recording Points

The server's `player.ts` has clear track transition functions where listens should be recorded for the **outgoing** track:

- `skip()` — user skips forward
- `trackEnded()` — natural track completion
- `stop()` — user stops playback
- `jumpToIndex()` — user jumps to a different queue position
- `previousTrack()` — user goes back

At each transition, check if the outgoing track's accumulated progress >= 30 seconds. If so, insert a listen log row.

## Database Schema (Conceptual)

```
listen_log
  id            INTEGER PRIMARY KEY AUTOINCREMENT
  composite_id  TEXT NOT NULL        -- e.g., "ytmusic:dQw4w9WgXcQ"
  title         TEXT NOT NULL
  artist        TEXT NOT NULL
  album         TEXT
  source        TEXT NOT NULL        -- "pandora", "ytmusic"
  listened_at   TEXT NOT NULL        -- ISO 8601 timestamp
```

## Open Questions

- Should the UI be a dedicated "History" page or a section on the home page? (Defer to planning)
- Pagination strategy for the history query? (Defer to planning)
