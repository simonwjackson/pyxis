---
title: "refactor: Migrate database from SQLite/Drizzle to ProseQL"
type: refactor
date: 2026-02-11
---

# Migrate Database from SQLite/Drizzle to ProseQL

## Overview

Replace Pyxis's SQLite + Drizzle ORM database layer with ProseQL, a plain-text file-based database built on Effect-TS. All 11 DB-touching files migrate from Drizzle queries to ProseQL's Effect-based API. The tRPC boundary is unchanged — no frontend modifications needed.

## Motivation

- **Human-readable persistence**: YAML files are diffable, editable, and version-controllable
- **Effect-TS native**: ProseQL uses the same Effect patterns already used in Pandora source — eliminates the sync/async DB call mismatch
- **No binary dependencies**: Removes SQLite driver dependency; plain text files work everywhere
- **Simpler deployment**: No database engine, no WAL files, no migration SQL strings

## Proposed Solution

Replace the 2 DB core files + 9 consumer files with ProseQL equivalents. Data persists to `~/.local/share/pyxis/db/` as YAML (most collections) and JSONL (listen log, using append-only mode).

### Pre-requisite: ProseQL Append-Only Mode

Before the Pyxis migration, ProseQL needs an `appendOnly: true` collection option for the listen log. This is a separate task in the ProseQL repo. See `history/migrate-to-proseql.md` for the full specification.

## Technical Approach

### SpecFlow Concerns Addressed

The SpecFlow analysis raised valid concerns. Here's how ProseQL's architecture handles them:

| Concern | Resolution |
|---------|------------|
| **Transaction atomicity** | ProseQL transactions lock a `Ref<boolean>`, defer all file writes until commit, then flush. Multi-collection mutations are atomic in-memory. File writes use temp+rename (no partial writes). |
| **Concurrent writes** | All state lives in `Ref<ReadonlyMap>` — Effect's atomic reference. Concurrent mutations are serialized through Ref.update. File writes are debounced per-collection (no races). |
| **Read isolation** | Reads come from in-memory Ref, not disk. Always consistent with latest state. |
| **Corrupted files** | Node adapter writes atomically (temp file + `renameSync`). Schema validation on load rejects invalid data with tagged errors. |
| **Multiple processes** | Non-issue — Pyxis runs as single systemd service. ProseQL is single-process by design. |
| **Schema evolution** | ProseQL supports versioned migrations with `version` + `migrations` config per collection. |
| **File watching** | Built-in `createFileWatcher()` detects external edits and reloads into memory. |

### Database Configuration

7 ProseQL collections replace the 8 SQLite tables (queue_items + queue_state merge into one document):

```
~/.local/share/pyxis/db/
├── albums.yaml
├── album-source-refs.yaml
├── album-tracks.yaml
├── playlists.yaml
├── player-state.yaml
├── queue-state.yaml          # merged: queue items + queue metadata
└── listen-log.jsonl           # append-only
```

### Schema Definitions

All schemas use `Schema.optionalWith(Schema.X, { exact: true })` due to `exactOptionalPropertyTypes: true` in tsconfig.

```typescript
// src/db/config.ts

const AlbumSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  artist: Schema.String,
  year: Schema.optionalWith(Schema.Number, { exact: true }),
  artworkUrl: Schema.optionalWith(Schema.String, { exact: true }),
  createdAt: Schema.optionalWith(Schema.Number, { exact: true }),
})

const AlbumSourceRefSchema = Schema.Struct({
  id: Schema.String,
  albumId: Schema.String,
  source: Schema.String,
  sourceId: Schema.String,
})

const AlbumTrackSchema = Schema.Struct({
  id: Schema.String,
  albumId: Schema.String,
  trackIndex: Schema.Number,
  title: Schema.String,
  artist: Schema.String,
  duration: Schema.optionalWith(Schema.Number, { exact: true }),
  source: Schema.String,
  sourceTrackId: Schema.String,
  artworkUrl: Schema.optionalWith(Schema.String, { exact: true }),
})

const PlaylistSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  source: Schema.String,
  url: Schema.String,
  isRadio: Schema.optionalWith(Schema.Boolean, { exact: true }),
  seedTrackId: Schema.optionalWith(Schema.String, { exact: true }),
  artworkUrl: Schema.optionalWith(Schema.String, { exact: true }),
  createdAt: Schema.optionalWith(Schema.Number, { exact: true }),
})

const PlayerStateSchema = Schema.Struct({
  id: Schema.String,               // always "current"
  status: Schema.String,
  progress: Schema.Number,
  duration: Schema.Number,
  volume: Schema.Number,
  updatedAt: Schema.Number,
})

const QueueStateSchema = Schema.Struct({
  id: Schema.String,               // always "current"
  currentIndex: Schema.Number,
  contextType: Schema.String,
  contextId: Schema.optionalWith(Schema.String, { exact: true }),
  items: Schema.Array(Schema.Struct({
    opaqueTrackId: Schema.String,
    source: Schema.String,
    title: Schema.String,
    artist: Schema.String,
    album: Schema.String,
    duration: Schema.optionalWith(Schema.Number, { exact: true }),
    artworkUrl: Schema.optionalWith(Schema.String, { exact: true }),
  })),
})

const ListenLogSchema = Schema.Struct({
  id: Schema.String,
  compositeId: Schema.String,
  title: Schema.String,
  artist: Schema.String,
  album: Schema.optionalWith(Schema.String, { exact: true }),
  source: Schema.String,
  listenedAt: Schema.optionalWith(Schema.Number, { exact: true }),
})
```

Database config with relationships and indexes:

```typescript
const dbConfig = {
  albums: {
    schema: AlbumSchema,
    file: "albums.yaml",
    relationships: {
      sourceRefs: { type: "inverse", target: "albumSourceRefs", foreignKey: "albumId" },
      tracks: { type: "inverse", target: "albumTracks", foreignKey: "albumId" },
    },
  },
  albumSourceRefs: {
    schema: AlbumSourceRefSchema,
    file: "album-source-refs.yaml",
    indexes: ["albumId", "source"],
    relationships: {
      album: { type: "ref", target: "albums", foreignKey: "albumId" },
    },
  },
  albumTracks: {
    schema: AlbumTrackSchema,
    file: "album-tracks.yaml",
    indexes: ["albumId"],
    relationships: {
      album: { type: "ref", target: "albums", foreignKey: "albumId" },
    },
  },
  playlists: {
    schema: PlaylistSchema,
    file: "playlists.yaml",
    indexes: ["source"],
    relationships: {},
  },
  playerState: {
    schema: PlayerStateSchema,
    file: "player-state.yaml",
    relationships: {},
  },
  queueState: {
    schema: QueueStateSchema,
    file: "queue-state.yaml",
    relationships: {},
  },
  listenLog: {
    schema: ListenLogSchema,
    file: "listen-log.jsonl",
    appendOnly: true,
    relationships: {},
  },
} as const
```

## Implementation Phases

### Phase 1: ProseQL Append-Only Mode (in plan-text-db repo)

Add `appendOnly: true` collection config option to ProseQL.

**Files to modify in `/snowscape/code/sandbox/plan-text-db`:**

1. **`packages/core/src/types/storage-adapter-types.ts`** — Add `append` method to `StorageAdapterShape`
2. **`packages/node/src/node-adapter-layer.ts`** — Implement `append()` using `fs.appendFile()`
3. **`packages/core/src/types/database-config-types.ts`** — Add `appendOnly?: boolean` to `CollectionConfig`
4. **`packages/core/src/factories/database-effect.ts`** — Wire append-only persistence:
   - Skip debounced `PersistenceTrigger` for append-only collections
   - `afterMutation` directly calls `StorageAdapter.append()` with single JSON line
   - Block `update`/`updateMany`/`delete`/`deleteMany` with descriptive error
5. **`packages/core/src/storage/persistence-effect.ts`** — `saveData()` still used for `flush()` on shutdown (canonical rewrite)
6. **Tests** — Verify: only create/query/findById allowed; file grows by one line per create; loadData reads correctly; flush writes clean JSONL

### Phase 2: DB Core (in pyxis repo)

Replace the database initialization and schema.

**Files:**

1. **`src/db/schema.ts`** → **`src/db/config.ts`** (rename)
   - Replace Drizzle `sqliteTable()` definitions with Effect Schema structs
   - Export `dbConfig` object and all schema types
   - Export `DbInstance` type (the ProseQL database type)

2. **`src/db/index.ts`** — Replace SQLite init with ProseQL
   - Remove: SQLite connection, WAL mode, MIGRATION_SQL, PGlite backup logic
   - Add: `createPersistentEffectDatabase(dbConfig)` with `NodeStorageLayer` + `yamlCodec()` + `jsonlCodec()`
   - Keep: `getDb()` singleton pattern (returns cached ProseQL instance)
   - Data directory: `~/.local/share/pyxis/db/` (same as current)
   - ProseQL's debounce default is 100ms; override to 1000ms for `playerState` and `queueState` via `persistenceConfig`

### Phase 3: Consumer Migration (in pyxis repo)

Migrate each consumer file from Drizzle to ProseQL. Each file is independent — can be done in any order.

#### 3a. `server/services/persistence.ts` — Player/queue state

| Current (Drizzle) | New (ProseQL) |
|---|---|
| `db.insert(playerState).values({...}).onConflictDoUpdate(...)` | `db.playerState.upsert({ id: "current", ... })` |
| `db.select().from(playerState).where(eq(id, "current"))` | `db.playerState.findById("current")` |
| `DELETE all queueItems` + `INSERT batch` + `upsert queueState` | `db.queueState.upsert({ id: "current", currentIndex, contextType, contextId, items: [...] })` |

- Remove application-level debounce (1000ms) — ProseQL handles it
- Queue simplification: merged items+state into single document eliminates delete-all-then-reinsert pattern

#### 3b. `server/routers/library.ts` — Album CRUD

| Current | New |
|---|---|
| `SELECT albums` + `SELECT albumSourceRefs` (join in memory) | `db.albums.query({})` + `db.albumSourceRefs.query({})` (same pattern) |
| `SELECT albumTracks WHERE albumId ORDER BY trackIndex` | `db.albumTracks.query({ where: { albumId }, sort: { trackIndex: "asc" } })` |
| Transaction: INSERT album + refs + tracks | `db.albums.create(...)` then `db.albumSourceRefs.createMany(...)` then `db.albumTracks.createMany(...)` |
| `DELETE albums WHERE id` (cascade) | `db.albumTracks.deleteMany({ where: { albumId: id } })` then `db.albumSourceRefs.deleteMany({ where: { albumId: id } })` then `db.albums.delete(id)` |
| `UPDATE albums SET title, artist WHERE id` | `db.albums.update(id, { title, artist })` |
| `UPDATE albumTracks SET title WHERE id` | `db.albumTracks.update(id, { title })` |

- No cascade delete — delete children first, then parent
- Check existence via `db.albumSourceRefs.query({ where: { source, sourceId } })` before save

#### 3c. `server/routers/listenLog.ts` — History queries

| Current | New |
|---|---|
| `SELECT ... ORDER BY listenedAt DESC LIMIT X OFFSET Y` | `db.listenLog.query({ sort: { listenedAt: "desc" }, limit, offset })` |

#### 3d. `server/routers/playlist.ts` — Playlist upsert

| Current | New |
|---|---|
| `INSERT ... ON CONFLICT DO NOTHING` | `db.playlists.upsert({ id: "radio-" + seedTrackId, ... })` |

#### 3e. `server/lib/ids.ts` — Track ID resolution

| Current | New |
|---|---|
| `SELECT source, sourceTrackId FROM albumTracks WHERE id = X` | `db.albumTracks.findById(opaqueId)` → extract `.source`, `.sourceTrackId` |

#### 3f. `server/services/player.ts` — Listen log recording

| Current | New |
|---|---|
| `db.insert(listenLog).values({...}).run()` (synchronous) | `Effect.runPromise(db.listenLog.create({ ... }))` or `Effect.runFork(db.listenLog.create({ ... }))` for fire-and-forget |

- Current code is sync `.run()`. ProseQL returns an Effect. Use `runFork` to maintain fire-and-forget semantics.

#### 3g. `server/services/sourceManager.ts` — Load ytmusic playlists

| Current | New |
|---|---|
| `SELECT FROM playlists WHERE source = "ytmusic"` | `db.playlists.query({ where: { source: "ytmusic" } })` |

#### 3h. `server/scripts/import-albums.ts` — Batch import

- Same pattern as 3b album save, but in a loop
- Check existence: `db.albumSourceRefs.query({ where: { source, sourceId } })`
- Create: `db.albums.create()` + `db.albumSourceRefs.createMany()` + `db.albumTracks.createMany()`

#### 3i. `server/scripts/enrich-library.ts` — Metadata enrichment

- Read all: `db.albums.query({})` + `db.albumSourceRefs.query({})`
- Update: `db.albums.update(id, { artworkUrl })` + `db.albumSourceRefs.create(...)` for new refs

### Phase 4: Migration Script & Cleanup

1. **`server/scripts/migrate-sqlite-to-proseql.ts`** (new) — One-time migration:
   - Open existing SQLite DB at `~/.local/share/pyxis/db/pyxis.db`
   - Read all rows from each table
   - Write corresponding YAML/JSONL files
   - Rename `pyxis.db` → `pyxis.db.bak` (preserve for rollback)
   - Verify: count records in ProseQL matches SQLite

2. **Auto-detect on startup**: `src/db/index.ts` checks if `pyxis.db` exists but YAML files don't → run migration automatically

3. **Remove dependencies**: `drizzle-orm` from `package.json`

4. **Add dependencies**: `@proseql/core`, `@proseql/node` (or workspace link if monorepo)

## Acceptance Criteria

### Functional

- [ ] All 9 consumer files use ProseQL instead of Drizzle
- [ ] Server starts and loads existing data from YAML/JSONL files
- [ ] Albums: create, read, update, delete work (with manual cascade)
- [ ] Player state persists across restarts (debounced writes)
- [ ] Queue state persists across restarts (merged document)
- [ ] Listen log appends without rewriting file
- [ ] History pagination works (sort by listenedAt desc, limit/offset)
- [ ] Track resolution (nanoid → composite ID) works
- [ ] Playlist upsert works (radio station creation)
- [ ] Batch import script works
- [ ] One-time SQLite → ProseQL migration script works

### Non-Functional

- [ ] `bun run typecheck` passes
- [ ] `bun test` passes (existing tests, adapted for ProseQL)
- [ ] Server startup with empty DB (first-time user) works
- [ ] Server startup with existing YAML files (returning user) works
- [ ] No `drizzle-orm` in final `package.json`

## Dependencies & Risks

| Risk | Mitigation |
|------|------------|
| ProseQL append-only mode doesn't exist yet | Phase 1 builds it first; rest of migration doesn't depend on it except listenLog |
| Effect `runPromise` in sync code paths (player.ts) | Use `Effect.runFork` for fire-and-forget, or `Effect.runSync` where ProseQL supports it |
| No cascade delete | Delete children before parent — same order every time to avoid orphans |
| Existing SQLite data lost | Migration script runs automatically on first startup; preserves `.db.bak` |

## References

- Detailed migration spec with full code examples: `history/migrate-to-proseql.md`
- ProseQL source: `/snowscape/code/sandbox/plan-text-db`
- ProseQL persistence internals: `packages/core/src/storage/persistence-effect.ts`
- ProseQL database factory: `packages/core/src/factories/database-effect.ts`
- Current Drizzle schema: `src/db/schema.ts`
- Current DB init: `src/db/index.ts`
