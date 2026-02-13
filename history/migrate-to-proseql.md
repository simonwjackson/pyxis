
### Context

Pyxis (`/snowscape/code/sandbox/pyxis`) is a music streaming daemon. It currently uses SQLite + Drizzle ORM for persistence. The query patterns are extremely simple — no joins, no aggregations, all single-table operations. The DB is only accessed server-side.

### Current schema → ProseQL collections

Map the 8 Drizzle tables to 7 ProseQL collections (merge queue_items + queue_state):

```typescript
// File: src/db/config.ts (new)

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
  id: Schema.String,  // always "current"
  status: Schema.String,
  progress: Schema.Number,
  duration: Schema.Number,
  volume: Schema.Number,
  updatedAt: Schema.Number,
})

// Merged queue_items + queue_state into one collection
const QueueStateSchema = Schema.Struct({
  id: Schema.String,  // always "current"
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

Database config:

```typescript
const dbConfig = {
  albums: {
    schema: AlbumSchema,
    file: "albums.yaml",
    relationships: {
      sourceRefs: { type: "inverse" as const, target: "albumSourceRefs", foreignKey: "albumId" },
      tracks: { type: "inverse" as const, target: "albumTracks", foreignKey: "albumId" },
    },
  },
  albumSourceRefs: {
    schema: AlbumSourceRefSchema,
    file: "album-source-refs.yaml",
    indexes: ["albumId", "source"],
    relationships: {
      album: { type: "ref" as const, target: "albums", foreignKey: "albumId" },
    },
  },
  albumTracks: {
    schema: AlbumTrackSchema,
    file: "album-tracks.yaml",
    indexes: ["albumId"],
    relationships: {
      album: { type: "ref" as const, target: "albums", foreignKey: "albumId" },
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
    appendOnly: true,  // ← From Task 1
    relationships: {},
  },
} as const
```

Data directory: `~/.local/share/pyxis/db/` (same location, but now contains YAML/JSONL files instead of SQLite).

### Files to modify

These 11 files contain all DB operations. Each needs to be migrated from Drizzle to ProseQL:

#### 1. `src/db/index.ts` — Replace SQLite init with ProseQL init

Current: Creates SQLite connection, runs migration SQL, returns Drizzle instance.
New: Create ProseQL database with the config above, return it. Use `@proseql/node` with `NodeStorageLayer` and `yamlCodec()` + `jsonlCodec()`.

The `getDb()` function should return the ProseQL database instance. It's called from multiple server files.

#### 2. `src/db/schema.ts` — Replace with ProseQL schemas

Current: Drizzle table definitions.
New: Effect Schema definitions (as shown above) + the database config object.

#### 3. `server/services/persistence.ts` — Player/queue persistence

Current operations (replace each):
- `savePlayerState(state)`: `INSERT ... ON CONFLICT UPDATE` → `db.playerState.upsert({ id: "current", ...state })`
- `loadPlayerState()`: `SELECT WHERE id = "current"` → `db.playerState.findById("current")`
- `saveQueueState(items, state)`: `DELETE all queue_items` + `INSERT batch` + upsert queueState → `db.queueState.upsert({ id: "current", currentIndex, contextType, contextId, items })`
- `loadQueueState()`: `SELECT` from both tables → `db.queueState.findById("current")`

Note: The current code debounces saves at 1000ms. ProseQL already debounces file writes at 100ms. You may want to keep the application-level 1000ms debounce and increase ProseQL's to match, or remove the application-level debounce and rely on ProseQL's.

#### 4. `server/routers/library.ts` — Album CRUD

Current operations (replace each):
- List albums: `SELECT` albums + `SELECT` albumSourceRefs, join in memory → `db.albums.query({})` + `db.albumSourceRefs.query({})`  (same pattern, just different API)
- Get album tracks: `SELECT WHERE albumId, ORDER BY trackIndex` → `db.albumTracks.query({ where: { albumId }, sort: { trackIndex: "asc" } })`
- Save album: Transaction with 3 inserts → `db.albums.create(...)` then `db.albumSourceRefs.createMany(...)` then `db.albumTracks.createMany(...)`  (ProseQL supports transactions if atomicity is needed)
- Remove album: `DELETE WHERE id` (cascade) → `db.albums.delete(id)` + `db.albumSourceRefs.deleteMany({ where: { albumId: id } })` + `db.albumTracks.deleteMany({ where: { albumId: id } })`  (no cascade — handle manually)
- Update album: `UPDATE ... SET` → `db.albums.update(id, { title, artist })`
- Update track: `UPDATE ... SET` → `db.albumTracks.update(id, { title })`

#### 5. `server/routers/listenLog.ts` — Listen history

Current: `SELECT ... ORDER BY listenedAt DESC LIMIT X OFFSET Y`
New: `db.listenLog.query({ sort: { listenedAt: "desc" }, limit, offset })`

#### 6. `server/routers/playlist.ts` — Playlist creation

Current: `INSERT ... ON CONFLICT DO NOTHING`
New: `db.playlists.upsert({ id: "radio-" + seedTrackId, ... })`  (upsert is close enough — the intent is "create if not exists")

#### 7. `server/lib/ids.ts` — Track ID resolution

Current: `SELECT source, sourceTrackId FROM albumTracks WHERE id = X`
New: `db.albumTracks.findById(opaqueId)` then extract `.source` and `.sourceTrackId`

#### 8. `server/services/player.ts` — Listen log recording

Current: `db.insert(listenLog).values({...}).run()`
New: `db.listenLog.create({ id, compositeId, title, artist, album, source, listenedAt })`

Note: Current code uses synchronous `.run()`. ProseQL's `create()` returns an Effect. You'll need to run it with `Effect.runPromise()` or fire-and-forget with `Effect.runFork()`.

#### 9. `server/services/sourceManager.ts` — Load ytmusic playlists

Current: `SELECT FROM playlists WHERE source = "ytmusic"`
New: `db.playlists.query({ where: { source: "ytmusic" } })`

#### 10. `server/scripts/import-albums.ts` — Batch album import

Current: Check if album exists by source ref, then transaction insert.
New: `db.albumSourceRefs.query({ where: { source, sourceId } })` to check existence, then `db.albums.create()` + `db.albumSourceRefs.createMany()` + `db.albumTracks.createMany()`.

#### 11. `server/scripts/enrich-library.ts` — Metadata enrichment

Current: Select all albums + refs, update artwork.
New: `db.albums.query({})` + `db.albumSourceRefs.query({})`, then `db.albums.update(id, { artworkUrl })` + `db.albumSourceRefs.create(...)` for new refs.

### Dependencies to remove

After migration, remove these from `package.json`:
- `drizzle-orm`
- `better-sqlite3` (or whatever SQLite driver is used)
- Any `@types/better-sqlite3`

Add:
- `@proseql/core`
- `@proseql/node`

### Migration strategy

1. Complete Task 1 (append-only support in ProseQL) first
2. Write `src/db/config.ts` with all ProseQL schemas and database config
3. Rewrite `src/db/index.ts` to initialize ProseQL instead of SQLite
4. Migrate each of the 9 consumer files one at a time
5. Write a one-time migration script that reads the existing SQLite DB and writes the YAML/JSONL files
6. Run `bun run typecheck` after each file to catch issues early
7. Run `bun test` to verify nothing broke
8. Delete `src/db/schema.ts` (Drizzle schema) and the migration SQL

### Key gotchas

- **`exactOptionalPropertyTypes: true`** is enabled in tsconfig. Use `Schema.optionalWith(Schema.X, { exact: true })` not `Schema.optional(Schema.X)` for optional fields.
- **Effect runPromise**: Many current DB calls are synchronous (Drizzle's `.run()`, `.get()`, `.all()`). ProseQL returns Effects. You'll need `Effect.runPromise()` at call sites, or restructure the calling code to be Effect-based.
- **No cascade delete**: ProseQL doesn't auto-cascade. When deleting an album, manually delete its source refs and tracks.
- **ID generation**: Current code uses `nanoid(10)` from `server/lib/ids.ts`. ProseQL can use a custom `idGenerator` plugin, or you can keep generating IDs in application code and passing them to `create()`.
- **Queue state**: The current design uses two tables (queue_items + queue_state). The ProseQL version merges them into one document with an embedded `items` array. This simplifies the delete-all-then-reinsert pattern into a single `upsert()`.
- **Timestamps**: Drizzle uses `integer` for timestamps (Unix seconds). Keep the same format in ProseQL schemas — just `Schema.Number`.
