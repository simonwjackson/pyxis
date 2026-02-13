## 1. Foundation — Install ProseQL, create schemas, rewrite db init

- [x] 1.1 Install `@proseql/core` (npm) and `@proseql/node` (GitHub: `github:simonwjackson/proseql#main`). Run `just nix-lock` to regenerate bun.nix. Verify ProseQL + NodeStorageLayer works with Bun runtime (create minimal test: init db, write YAML, read back, then remove test file).

- [x] 1.2 Create `src/db/config.ts` with 7 Effect Schema definitions (AlbumSchema, AlbumSourceRefSchema, AlbumTrackSchema, PlaylistSchema, PlayerStateSchema, QueueStateSchema with nested `items: Schema.Array(QueueItemSchema)`, ListenLogSchema). Create the ProseQL database config object with: `relationships` (albums ↔ albumSourceRefs ↔ albumTracks via ref/inverse), `indexes` (albumTracks["albumId"], playlists["source"], albumSourceRefs[["source","sourceId"]]), `uniqueFields` (albumSourceRefs[["source","sourceId"]]), `appendOnly: true` for listenLog, and `file` paths under `~/.local/share/pyxis/db/`. Rewrite `src/db/index.ts` to replace SQLite init with `createPersistentEffectDatabase()` from `@proseql/node`, provide `NodeStorageLayer` + `makeSerializerLayer([yamlCodec()])`, keep `getDb()` singleton pattern. Run `bun run typecheck`.

## 2. Migrate all consumer files (9 files)

- [x] 2.1 Migrate all server routers, services, and lib files from Drizzle to ProseQL API. Files to change:
  - `server/services/persistence.ts` — player state upsert via `db.playerState.upsert()`, queue via single `db.queueState.upsert()` with embedded items array, loads via `findById("current")`. Keep 1000ms debounce.
  - `server/routers/library.ts` — list albums via `db.albums.query()` + `db.albumSourceRefs.query()` (or `populate`), saveAlbum via `db.$transaction()` + `db.flush()`, removeAlbum via 3-step manual delete (tracks, refs, album), updateAlbum/updateTrack via `db.*.update()`, checkAlbumExists via indexed `db.albumSourceRefs.query({ where: { source, sourceId } })`, getAlbumTracks via `db.albumTracks.query({ where: { albumId }, sort: { trackIndex: "asc" } })`
  - `server/routers/listenLog.ts` — `db.listenLog.query({ sort: { listenedAt: "desc" }, limit, offset })`
  - `server/routers/playlist.ts` — `db.playlists.upsert({ where: { id }, create: {...}, update: {} })`
  - `server/lib/ids.ts` — `db.albumTracks.findById(opaqueId)`, catch `NotFoundError`
  - `server/services/player.ts` — `db.listenLog.create(...)` (appendOnly auto-appends JSONL)
  - `server/services/sourceManager.ts` — `db.playlists.query({ where: { source: "ytmusic" } })`
  - `server/scripts/import-albums.ts` — indexed existence check, `db.$transaction()` for album creates, `db.flush()` after each
  - `server/scripts/enrich-library.ts` — `db.albums.query({})`, `db.albumSourceRefs.query({})`, `db.$transaction()` for batch ref creates + artwork updates
  Run `bun run typecheck` after all changes.

## 3. SQLite migration script + cleanup

- [x] 3.1 Write `server/scripts/migrate-sqlite.ts`: read all 8 SQLite tables using `bun:sqlite` directly (not Drizzle), write to ProseQL YAML/JSONL via the ProseQL API, merge `queue_items` + `queue_state` into single queueState with embedded items, report counts per collection. Integrate auto-migration into `src/db/index.ts` `getDb()`: on startup check if `pyxis.db` exists AND YAML files do not — if so run migration and rename to `.bak` (skip if `.bak` exists). Delete `src/db/schema.ts`, remove migration SQL from `src/db/index.ts`, remove `drizzle-orm` from package.json, remove all `drizzle-orm` and `bun:sqlite` imports from consumer files (keep `bun:sqlite` only in migration script). Run `bun run typecheck`, `bun test`, `just nix-lock`, and verify `nix build` succeeds.
