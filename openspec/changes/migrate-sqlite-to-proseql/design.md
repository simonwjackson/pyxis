## Context

Pyxis persists player state, queue, library albums, playlists, and listen history using SQLite via Drizzle ORM (`bun:sqlite`). All database operations are single-table CRUD — no joins, no aggregations, no complex queries. The database is only accessed server-side. The current schema has 8 tables; the migration plan consolidates to 7 ProseQL collections (merging `queue_items` + `queue_state`).

ProseQL (v0.1.0) stores data as human-readable YAML files (for structured collections) and JSONL files (for append-only logs), validated against Effect Schemas at read/write time. It now supports transactions, relationships, indexes, unique constraints, reactive queries, lifecycle hooks, and schema migrations.

## Goals / Non-Goals

**Goals:**
- Replace SQLite + Drizzle ORM with ProseQL YAML/JSONL persistence
- Maintain identical data semantics and API behavior
- Make persisted data human-readable and inspectable without tooling
- Simplify the dependency chain (remove native SQLite bindings)
- Provide a one-time migration script for existing users
- Use ProseQL transactions for multi-collection atomic writes (album saves)
- Use ProseQL relationships for referential integrity (albums ↔ refs ↔ tracks)
- Use ProseQL append-only mode for listen log efficiency

**Non-Goals:**
- Changing the tRPC API surface or client behavior
- Using reactive queries for live UI (future possibility, not this migration)
- Supporting concurrent multi-process access (Pyxis is single-process)
- Migrating away from Effect — ProseQL uses Effect natively

## Decisions

### 1. ProseQL with YAML for structured data, JSONL for append-only logs

**Decision**: Use `yamlCodec()` for 6 collections (albums, albumSourceRefs, albumTracks, playlists, playerState, queueState) and JSONL for listenLog via `appendOnly: true`.

**Rationale**: YAML is human-readable and git-diffable for data that gets updated in place. The `appendOnly: true` flag on a JSONL collection is the idiomatic ProseQL approach — each `create()` appends a single line without rewriting. SQLite offered no advantage over flat files given the simple access patterns.

**Alternative considered**: JSON files for all collections. Rejected because YAML is more readable for config-like data, and appendOnly JSONL naturally supports the listen log pattern.

### 2. Merge queue_items and queue_state into a single collection

**Decision**: Combine the two tables into a single `queueState` collection with an embedded `items` array using nested Effect Schema.

**Rationale**: The current code always deletes all queue_items then re-inserts them alongside upserting queue_state. This is a single logical document — there's no case where items exist without a state row or vice versa. ProseQL's nested data support (with schema validation on the embedded array) replaces the delete-all-then-reinsert pattern with a single `upsert()`.

### 3. Use ProseQL transactions for atomic multi-collection writes

**Decision**: Use `db.$transaction()` for album saves (albums + refs + tracks) and enrichment script batch updates.

**Rationale**: The old plan accepted the risk of partial writes. ProseQL now supports transactions — if any operation in the saveAlbum sequence fails, everything rolls back. This matches the SQLite behavior exactly. Rolled-back transactions never touch disk.

**Migration from SQLite**:
```typescript
// Before (Drizzle):
await db.transaction(async (tx) => { ... })

// After (ProseQL):
await db.$transaction(async (tx) => { ... })
```

### 4. Use ProseQL relationships for album ↔ refs ↔ tracks

**Decision**: Define `ref`/`inverse` relationships between albums, albumSourceRefs, and albumTracks collections.

**Rationale**: The current code does JS-side joins (query albums, query refs separately, merge in code). ProseQL relationships with `populate` can do this in a single query. More importantly, foreign key constraints catch dangling references. This replaces the manual 3-step cascade delete with ProseQL-enforced referential integrity (though we still manually delete refs/tracks before the album since ProseQL doesn't auto-cascade).

```typescript
const config = {
  albums: {
    schema: AlbumSchema,
    file: "./data/albums.yaml",
    relationships: {
      sourceRefs: { type: "inverse", target: "albumSourceRefs", foreignKey: "albumId" },
      tracks: { type: "inverse", target: "albumTracks", foreignKey: "albumId" },
    },
  },
  albumSourceRefs: {
    schema: AlbumSourceRefSchema,
    file: "./data/album-source-refs.yaml",
    uniqueFields: [["source", "sourceId"]],
    relationships: {
      album: { type: "ref", target: "albums", foreignKey: "albumId" },
    },
  },
  albumTracks: {
    schema: AlbumTrackSchema,
    file: "./data/album-tracks.yaml",
    indexes: ["albumId"],
    relationships: {
      album: { type: "ref", target: "albums", foreignKey: "albumId" },
    },
  },
}
```

### 5. Use indexes for frequent lookups

**Decision**: Add indexes on frequently filtered fields.

**Rationale**: Several queries filter on specific fields repeatedly — `albumTracks` by `albumId`, `playlists` by `source`, `albumSourceRefs` by `source`+`sourceId`. ProseQL indexes provide O(1) lookups instead of full scans.

```typescript
albumTracks:    indexes: ["albumId"]
playlists:      indexes: ["source"]
albumSourceRefs: indexes: [["source", "sourceId"]]
```

### 6. Use unique constraints for upsert-like patterns

**Decision**: Define `uniqueFields` on `albumSourceRefs` for `[source, sourceId]` compound uniqueness.

**Rationale**: The current code uses `INSERT ... ON CONFLICT DO NOTHING` for album source refs. ProseQL's `uniqueFields` constraint achieves the same — attempting to create a duplicate throws `UniqueConstraintError` which can be caught cleanly.

### 7. Use appendOnly for listen log

**Decision**: Configure listenLog as `appendOnly: true` with `.jsonl` file extension.

**Rationale**: ProseQL's append-only mode is purpose-built for this pattern. Each `create()` appends a single JSONL line. `update()` and `delete()` throw `OperationError`. Queries still work normally (sorted, paginated). This is more efficient than rewriting the entire file on each listen event.

```typescript
listenLog: {
  schema: ListenLogSchema,
  file: "./data/listen-log.jsonl",
  appendOnly: true,
  relationships: {},
}
```

### 8. Keep application-level debounce, rely on ProseQL for write batching

**Decision**: Keep the 1000ms application-level debounce in `persistence.ts`. ProseQL's internal write debounce (100ms default) provides an additional safety net.

**Rationale**: Player progress updates fire rapidly during playback. The 1000ms application-level debounce is the right coarse-grained control. ProseQL's finer-grained debounce handles any remaining write bursts.

### 9. Keep Effect.runPromise bridge at call sites

**Decision**: Wrap ProseQL's Effect-returning API with `Effect.runPromise()` at each call site, matching the existing async/await pattern.

**Rationale**: The existing codebase uses async/await throughout. Converting all callers to native Effect pipelines would be a massive scope expansion. `Effect.runPromise()` bridges cleanly. ProseQL also supports `.runPromise` directly on query results.

### 10. Install @proseql/node from GitHub until npm publish

**Decision**: Install `@proseql/node` directly from the GitHub repo since it's not yet published to npm.

**Rationale**: `@proseql/core` is on npm (0.1.0) but `@proseql/node` (which provides `NodeStorageLayer`) is not. Since the user owns both repos, installing from GitHub is practical. Switch to npm once published.

```json
{
  "@proseql/core": "^0.1.0",
  "@proseql/node": "github:simonwjackson/proseql#main"
}
```

## Risks / Trade-offs

- **[Data loss during migration]** → The migration script reads SQLite and writes YAML/JSONL. Keep the old SQLite file as backup (rename to `pyxis.db.bak`). ProseQL init checks for this and skips migration if YAML files already exist.

- **[Performance for large listen logs]** → JSONL files grow unbounded. For the listen log query pattern (paginated, sorted by listenedAt DESC), the entire file must be read and sorted in memory. → For now this is acceptable (listen logs are small — a few thousand entries). ProseQL's append-only mode avoids the rewrite cost. If it becomes a problem, consider `flush()` for periodic compaction.

- **[Transactions are in-memory rollback]** → ProseQL transactions roll back in-memory state but writes are still debounced to disk. A crash between commit and flush could lose the transaction. → Acceptable for Pyxis's use case. Call `db.flush()` after critical transactions (album saves) for immediate persistence.

- **[File corruption on crash]** → YAML files could be partially written on process crash. → ProseQL uses atomic write (write to temp file, then rename), which is safe on modern filesystems.

- **[@proseql/node not on npm]** → Must install from GitHub. → Temporary; switch to npm version once published. Nix build may need hash update.

## Migration Plan

1. Install `@proseql/core` (npm) and `@proseql/node` (GitHub)
2. Create `src/db/config.ts` with Effect Schemas, ProseQL collection configs (relationships, indexes, uniqueFields, appendOnly)
3. Rewrite `src/db/index.ts` to initialize ProseQL with `NodeStorageLayer` + `makeSerializerLayer([yamlCodec()])`
4. Migrate each consumer file (11 files) one at a time, running `bun run typecheck` after each
   - Use `db.$transaction()` where SQLite transactions existed
   - Use `db.collection.query({ populate: ... })` to replace JS-side joins
   - Use `db.collection.upsert()` for single-row state tables
   - Use `appendOnly` collection for listen log
5. Write `server/scripts/migrate-sqlite.ts` — one-time script to read SQLite and write YAML/JSONL
6. Integrate migration into `getDb()` startup: if SQLite exists and YAML doesn't, auto-migrate and rename SQLite to `.bak`
7. Remove `drizzle-orm` from dependencies, delete `src/db/schema.ts` and migration SQL
8. Run full test suite and manual smoke test

**Rollback**: If ProseQL migration fails, rename `pyxis.db.bak` back to `pyxis.db` and revert code changes. The SQLite file is never deleted, only renamed.

## Open Questions

- Should the listen log JSONL file be compacted periodically via `flush()`, or left to grow indefinitely?
- Should we use ProseQL lifecycle hooks for logging DB operations, or keep explicit logging in service code?
