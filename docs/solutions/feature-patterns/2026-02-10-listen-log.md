---
title: "Append-only listen log for played tracks"
date: "2026-02-10"
category: "feature-patterns"
tags:
  - listen-log
  - history
  - playback
  - append-only
  - proseql
  - jsonl
components:
  - server/services/player.ts
  - server/routers/listenLog.ts
  - server/router.ts
  - src/db/config.ts
  - src/web/features/history/history-page.tsx
  - src/web/routes/+history.tsx
  - src/web/shared/layout/sidebar.tsx
  - src/web/shared/layout/mobile-nav.tsx
problem_type: missing-feature
severity: medium
---

# Append-Only Listen Log for Played Tracks

## Problem

Pyxis had no record of what the user listened to. Once a track finished playing, there was no history. Users couldn't see what they'd played recently or revisit past listens.

## Solution

### Approach: Server-side recording at track transition points

The player service (`server/services/player.ts`) already had well-defined track transition functions (skip, trackEnded, stop, jumpToIndex, previousTrack). A `maybeLogListen()` helper was added and called at the **top** of each transition — before state is overwritten — to capture the outgoing track.

**Why server-side:** All playback logic runs through the player service. Recording here is a single source of truth that can't be bypassed by client disconnects. No client changes needed for the recording itself.

**Why 30-second threshold:** Industry standard (matches scrobbling services). Filters accidental plays and rapid skipping while capturing intentional listens.

### 1. Database — ProseQL append-only JSONL (`src/db/config.ts`)

```typescript
// Schema for listen log entries
listenedAt: Schema.Number, // Unix timestamp ms

// Collection config — append-only JSONL file
listenLog: {
  type: "appendOnly",
  file: join(DB_DIR, "listen-log.jsonl"),
}
```

**Why JSONL:** Listen history is write-heavy, read-seldom, and never updated. Append-only JSONL is the simplest storage model — no migrations, no table schema changes, just append a line. ProseQL handles the query/sort/pagination layer.

**Why denormalized:** Each entry stores title, artist, album, source directly. No joins needed. Resilient to metadata changes — if an album title is edited later, historical entries still show what was playing at the time.

### 2. Recording logic — `maybeLogListen()` (`server/services/player.ts`)

```typescript
function maybeLogListen(): void {
  const currentTrack = Queue.currentTrack();
  if (!currentTrack) return;

  const currentProgress = getProgress();
  if (currentProgress < LISTEN_THRESHOLD_SECONDS) return;

  // Fire and forget — don't block on async DB write
  void (async () => {
    try {
      const db = await getDb();
      await db.listenLog.create({
        id: generateId(),
        compositeId: currentTrack.id,
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: currentTrack.album,
        source: currentTrack.source,
        listenedAt: Date.now(),
      }).runPromise;
      log.info({ track: currentTrack.id, progress: currentProgress }, "listen logged");
    } catch (err) {
      log.error({ err, track: currentTrack.id }, "failed to log listen");
    }
  })();
}
```

Called at 5 transition points: `skip()`, `stop()`, `jumpToIndex()`, `previousTrack()`, and `play()` (when replacing current playback).

**Fire-and-forget pattern:** The async DB write runs without blocking the transition. Logging a listen should never delay the next track from starting. Errors are caught and logged, not thrown.

**Progress accuracy:** `getProgress()` dynamically computes elapsed time for playing tracks (`Date.now() - updatedAt + storedProgress`), giving sub-second accuracy for the 30s threshold check.

### 3. tRPC Router (`server/routers/listenLog.ts`)

Single `list` query with limit/offset pagination, sorted newest-first. Registered on the main app router as `listenLog`.

### 4. Frontend — History page (`src/web/features/history/history-page.tsx`)

- Route at `/history` via TanStack Router file-based routing
- Queries `listenLog.list` with offset pagination (50 per page)
- Each entry shows: title, artist — album, source badge, relative timestamp
- Empty state with explanation ("Songs you listen to for 30+ seconds will appear here")
- "History" nav item added to sidebar and mobile nav with lucide `History` icon

## Key Patterns

### Append-Only Collections in ProseQL

For write-heavy, never-updated data (logs, events, audit trails), use ProseQL's `appendOnly` collection type backed by JSONL. Simpler than a relational table, no schema migrations, trivially backupable (it's just a file).

### Fire-and-Forget Async in Synchronous Transition Functions

When a side effect (logging, analytics) shouldn't block the main operation, wrap in `void (async () => { try { ... } catch { log.error(...) } })()`. Always catch inside — unhandled rejections in fire-and-forget are silent bugs.

### Capture Before Overwrite

When recording state about an outgoing entity (track, session, etc.), always capture BEFORE the transition function overwrites state. `maybeLogListen()` is called at the top of each function, before `Queue.next()` / `Queue.jumpTo()` / etc.

### Denormalize Immutable History

Historical records should store the data as it was at the time, not reference current state. If the user renames an album later, listen history should still show the original title. Store the values inline rather than joining to mutable tables.

## Edge Cases Handled

- **Pause/resume:** Progress accumulates correctly across pause/resume cycles. A track paused at 20s, resumed, then skipped at 35s will be logged.
- **Same song twice:** Each transition creates a new row with a unique `id` and `listenedAt`. Two plays = two entries.
- **No outgoing track:** Returns early if `currentTrack` is null (fresh start, already stopped).
- **Server restart:** Progress is persisted. On restart, the next transition checks the restored progress value.
- **`trackEnded()` delegates to `skip()`:** The listen is recorded once via `skip()`, not double-counted.

## Gotchas

1. **The `listenLog.list` query uses ProseQL's `.query()` which reads the full JSONL file.** This is fine for personal use (thousands of entries) but would need indexing if the file grows to hundreds of thousands of lines.

2. **`listenedAt` is stored as Unix milliseconds (`Date.now()`), not seconds.** The frontend passes it to `new Date()` which handles ms correctly. Don't accidentally divide by 1000.

3. **The 30s threshold constant (`LISTEN_THRESHOLD_SECONDS`) lives in `player.ts`.** If you need to change it, there's one place to update.

## Related Documentation

- Brainstorm: `docs/brainstorms/2026-02-10-listen-log-brainstorm.md`
- Plan: `docs/plans/2026-02-10-feat-listen-log-plan.md`
- Player service: `server/services/player.ts` (transition functions, `maybeLogListen`)
- DB config: `src/db/config.ts` (ProseQL schema and collection definitions)
- Log file: `~/.local/state/pyxis/playback.log` (contains "listen logged" entries)
