---
title: "feat: Add listen log for played tracks"
type: feat
date: 2026-02-10
brainstorm: docs/brainstorms/2026-02-10-listen-log-brainstorm.md
---

# feat: Add listen log for played tracks

## Overview

Append-only listen log that records every song played for 30+ seconds. Server-side recording at player service track transition points, denormalized SQLite storage, tRPC API for querying, and a simple history page in the UI.

## Motivation

No listen history exists in pyxis. Once a song finishes playing, there's no record it was ever played. This feature creates a persistent log for browsing past listens.

## Proposed Solution

Hook into the player service's track transition functions to capture the outgoing track's state before it's overwritten. If the track was played for >= 30 seconds, insert a row into a new `listen_log` table. Expose via tRPC query and render in a history page.

## Technical Approach

### Phase 1: Database — `src/db/schema.ts` + `src/db/index.ts`

Add `listenLog` table to schema:

```typescript
// src/db/schema.ts
export const listenLog = sqliteTable("listen_log", {
  id: text("id").primaryKey(),
  compositeId: text("composite_id").notNull(),    // "ytmusic:dQw4w9WgXcQ"
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  album: text("album"),
  source: text("source").notNull(),               // "pandora" | "ytmusic"
  listenedAt: integer("listened_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
```

Add migration SQL to `MIGRATION_SQL` in `src/db/index.ts`:

```sql
CREATE TABLE IF NOT EXISTS listen_log (
  id TEXT PRIMARY KEY,
  composite_id TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT,
  source TEXT NOT NULL,
  listened_at INTEGER NOT NULL
);
```

### Phase 2: Recording logic — `server/services/player.ts`

Add a helper function that captures the outgoing track before state is reset:

```typescript
// server/services/player.ts

function maybeLogListen(): void {
  const state = getState();
  if (!state.currentTrack) return;
  if (state.progress < 30) return;

  const track = state.currentTrack;
  const db = getDb();
  db.insert(schema.listenLog)
    .values({
      id: generateId(),
      compositeId: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      source: track.source,
    })
    .run();
}
```

Call `maybeLogListen()` at the **top** of each transition function, before state is overwritten:

| Function | Where to insert call |
|----------|---------------------|
| `skip()` | First line, before `Queue.next()` |
| `trackEnded()` | First line (delegates to `skip()`, but add here if `trackEnded` gets its own logic) |
| `stop()` | First line, before progress reset |
| `jumpToIndex()` | First line, before `Queue.jumpTo()` |
| `previousTrack()` | First line, before `Queue.previous()` |
| `play()` | When `tracks` param is provided (new playback replaces current), before queue replacement |

**Progress accuracy**: `getState().progress` calls `getProgress()` which dynamically computes elapsed time for playing tracks (using `Date.now() - updatedAt + storedProgress`). This gives sub-second accuracy, well within the 30s threshold.

**Edge cases handled:**

- **Pause/resume**: Progress accumulates correctly because `pause()` stores computed progress and `resume()` uses it as the base. A paused-then-resumed track that totals 30s+ will be logged.
- **Server restart**: Progress is persisted to DB every 1s (debounced). On restart, `loadPlayerState()` restores progress. If progress was >= 30s before crash, the next transition will log it. If not, it's lost — acceptable.
- **Same song twice**: Each transition creates a new row with a new `id` and `listenedAt`. Two plays = two entries.
- **No outgoing track**: `maybeLogListen()` returns early if `currentTrack` is null (fresh start, already stopped).
- **`trackEnded()` delegates to `skip()`**: Since `trackEnded()` calls `skip()`, and `skip()` will have the `maybeLogListen()` call, the listen is recorded once. If `trackEnded()` gets refactored later to not delegate, add the call there too.

### Phase 3: tRPC Router — `server/routers/listenLog.ts`

```typescript
// server/routers/listenLog.ts
import { z } from "zod";
import { router, publicProcedure } from "../trpc.js";
import { getDb, schema } from "../../src/db/index.js";
import { desc } from "drizzle-orm";

export const listenLogRouter = router({
  list: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const db = getDb();
      return db
        .select()
        .from(schema.listenLog)
        .orderBy(desc(schema.listenLog.listenedAt))
        .limit(input.limit)
        .offset(input.offset);
    }),
});
```

Register in `server/router.ts`:

```typescript
import { listenLogRouter } from "./routers/listenLog.js";

export const appRouter = router({
  // ...existing routers
  listenLog: listenLogRouter,
});
```

### Phase 4: Frontend — Route + Page

**Route file**: `src/web/routes/+history.tsx`

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { HistoryPage } from "@/web/features/history/history-page";

export const Route = createFileRoute("/history")({
  component: HistoryPage,
});
```

**Page component**: `src/web/features/history/history-page.tsx`

- Query `listenLog.list` with limit/offset pagination
- Render a reverse-chronological list of listen entries
- Each entry shows: artwork (if available from artworkUrl — note: not stored in listen_log, so omit or add later), title, artist, album, source badge, relative timestamp
- "Load more" button for offset-based pagination

**Navigation**: Add "History" entry to `navItems` in:
- `src/web/shared/layout/sidebar.tsx`
- `src/web/shared/layout/mobile-nav.tsx`

Icon: `History` from lucide-react.

## Acceptance Criteria

- [x] New `listen_log` table created on server startup (`src/db/schema.ts`, `src/db/index.ts`)
- [x] Tracks played >= 30 seconds are logged on every track transition (`server/services/player.ts`)
- [x] Tracks played < 30 seconds are NOT logged
- [x] `listenLog.list` tRPC query returns paginated history newest-first (`server/routers/listenLog.ts`)
- [x] `/history` route renders listen history with track info and timestamps (`src/web/routes/+history.tsx`, `src/web/features/history/history-page.tsx`)
- [x] "History" appears in sidebar and mobile nav (`src/web/shared/layout/sidebar.tsx`, `src/web/shared/layout/mobile-nav.tsx`)
- [x] Same song played twice creates two separate log entries
- [x] Pause/resume correctly accumulates toward the 30s threshold

## Files to Create/Modify

| File | Action | Phase |
|------|--------|-------|
| `src/db/schema.ts` | Modify — add `listenLog` table | 1 |
| `src/db/index.ts` | Modify — add migration SQL | 1 |
| `server/services/player.ts` | Modify — add `maybeLogListen()`, call at transition points | 2 |
| `server/routers/listenLog.ts` | Create — `list` query with pagination | 3 |
| `server/router.ts` | Modify — register `listenLogRouter` | 3 |
| `src/web/routes/+history.tsx` | Create — route definition | 4 |
| `src/web/features/history/history-page.tsx` | Create — history page component | 4 |
| `src/web/shared/layout/sidebar.tsx` | Modify — add History nav item | 4 |
| `src/web/shared/layout/mobile-nav.tsx` | Modify — add History nav item | 4 |

## References

- Player service: `server/services/player.ts` (transition functions at lines 157, 209, 224, 250, 277, 343)
- Queue types: `server/services/queue.ts` (QueueTrack at line 18, QueueContext at line 44)
- Schema patterns: `src/db/schema.ts`
- Migration pattern: `src/db/index.ts` (MIGRATION_SQL)
- Router composition: `server/router.ts`
- Existing router example: `server/routers/library.ts`
- ID generation: `server/lib/ids.ts` (generateId)
- Route file pattern: `src/web/routes/+bookmarks.tsx`
- Nav items: `src/web/shared/layout/sidebar.tsx`, `src/web/shared/layout/mobile-nav.tsx`
