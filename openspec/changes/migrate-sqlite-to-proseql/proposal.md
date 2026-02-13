## Why

Pyxis uses SQLite + Drizzle ORM for persistence, but all query patterns are extremely simple — no joins, no aggregations, all single-table CRUD. SQLite adds binary dependency complexity (native bindings) and the schema requires SQL migrations. ProseQL stores data as human-readable YAML/JSONL files with Effect Schema validation, which better fits Pyxis's simple access patterns and makes data inspectable without tooling.

## What Changes

- **BREAKING**: Replace SQLite database (`~/.local/share/pyxis/db/pyxis.db`) with YAML/JSONL flat files in the same directory
- Replace Drizzle ORM with ProseQL (`@proseql/core` + `@proseql/node`) for all data access
- Merge `queue_items` + `queue_state` tables into a single `queueState` collection with embedded items array
- Convert all 8 Drizzle table definitions to 7 Effect Schema definitions with ProseQL collection configs
- Migrate 11 consumer files from Drizzle API to ProseQL API
- Remove `drizzle-orm` and `bun:sqlite` dependencies
- Add one-time migration script to convert existing SQLite data to YAML/JSONL

## Capabilities

### New Capabilities
- `proseql-persistence`: YAML/JSONL-backed data persistence layer using ProseQL with Effect Schema validation, replacing SQLite + Drizzle ORM
- `sqlite-migration`: One-time data migration from existing SQLite database to ProseQL YAML/JSONL files

### Leveraged ProseQL Features
- **Transactions** (`db.$transaction`) — atomic album saves (album + refs + tracks) and enrichment script batch updates, replacing SQLite `db.transaction()`
- **Append-only collections** (`appendOnly: true`) — listen log writes as single-line JSONL appends instead of full file rewrites
- **Reactive queries** (`db.collection.watch()`) — potential future use for live UI updates when library changes
- **Relationships** (`ref`/`inverse`) — albumSourceRefs → albums, albumTracks → albums relationships for referential integrity
- **Indexes** — genre, source, albumId fields for O(1) lookups replacing full-scan queries
- **Unique constraints** (`uniqueFields`) — albumSourceRefs `[source, sourceId]` compound uniqueness replaces `onConflictDoNothing`
- **Update operators** (`$increment`, `$set`) — cleaner partial updates for album metadata
- **Lifecycle hooks** (`beforeCreate`, `onChange`) — optional logging/validation without cluttering business logic
- **Schema migrations** — versioned transforms handle future schema evolution without manual scripts

### Modified Capabilities

## Impact

- **Database layer**: `src/db/index.ts` and `src/db/schema.ts` completely rewritten
- **Server services**: `server/services/persistence.ts`, `server/services/player.ts`, `server/services/sourceManager.ts` updated to use ProseQL API
- **Server routers**: `server/routers/library.ts`, `server/routers/listenLog.ts`, `server/routers/playlist.ts` updated
- **Server lib**: `server/lib/ids.ts` updated for ProseQL lookups
- **Scripts**: `server/scripts/import-albums.ts`, `server/scripts/enrich-library.ts` updated
- **Dependencies**: Remove `drizzle-orm`; add `@proseql/core`, `@proseql/node` (from GitHub until npm publish)
- **Data format**: Database changes from single binary file to directory of YAML/JSONL files — existing users need migration
