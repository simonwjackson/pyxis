## ADDED Requirements

### Requirement: ProseQL database initialization
The system SHALL initialize a ProseQL database instance with 7 typed collections (albums, albumSourceRefs, albumTracks, playlists, playerState, queueState, listenLog) at startup using `createPersistentEffectDatabase()` from `@proseql/node`. The `getDb()` function SHALL return the ProseQL instance as a singleton.

#### Scenario: First startup with no existing data
- **WHEN** the server starts and no data directory exists
- **THEN** ProseQL SHALL create the data directory at `~/.local/share/pyxis/db/` and initialize empty YAML/JSONL files for each collection

#### Scenario: Subsequent startup with existing data
- **WHEN** the server starts and YAML/JSONL files already exist
- **THEN** ProseQL SHALL load existing data from files and validate against Effect Schemas

#### Scenario: Database layer initialization
- **WHEN** `getDb()` is called
- **THEN** the system SHALL provide `NodeStorageLayer` and `makeSerializerLayer([yamlCodec()])` via `Effect.provide()` and return a scoped ProseQL database instance

### Requirement: Collection configuration with relationships, indexes, and constraints
The database config SHALL define relationships, indexes, and unique constraints for each collection.

#### Scenario: Album relationships
- **WHEN** the database is configured
- **THEN** albums SHALL have `inverse` relationships to albumSourceRefs and albumTracks via `albumId` foreign key
- **AND** albumSourceRefs and albumTracks SHALL have `ref` relationships back to albums

#### Scenario: Indexed lookups
- **WHEN** queries filter on `albumTracks.albumId`, `playlists.source`, or `albumSourceRefs.[source, sourceId]`
- **THEN** ProseQL SHALL use indexes for O(1) lookups instead of full collection scans

#### Scenario: Unique constraints on album source refs
- **WHEN** a duplicate `[source, sourceId]` combination is created in albumSourceRefs
- **THEN** ProseQL SHALL throw `UniqueConstraintError` instead of silently duplicating

### Requirement: Album CRUD via ProseQL
The system SHALL support creating, reading, updating, and deleting albums through ProseQL collections with transactional integrity for multi-collection writes.

#### Scenario: List all albums with source refs
- **WHEN** the library.albums endpoint is called
- **THEN** the system SHALL query albums with `populate: { sourceRefs: true }` or perform 2-query JS-join, returning albums with their source IDs

#### Scenario: Save a new album atomically
- **WHEN** saveAlbum is called with a source-prefixed album ID
- **THEN** the system SHALL use `db.$transaction()` to create records in albums, albumSourceRefs, and albumTracks collections atomically
- **AND** SHALL call `db.flush()` after the transaction for immediate disk persistence

#### Scenario: Save album that already exists
- **WHEN** saveAlbum is called and a matching albumSourceRef already exists for the source and sourceId
- **THEN** the system SHALL return the existing album ID with alreadyExists=true without creating duplicates
- **NOTE** The indexed `[source, sourceId]` query provides O(1) existence check

#### Scenario: Remove an album
- **WHEN** removeAlbum is called with an album ID
- **THEN** the system SHALL delete related albumTracks, then albumSourceRefs, then the album record (manual cascade, 3 steps)

#### Scenario: Update album metadata
- **WHEN** updateAlbum is called with title or artist changes
- **THEN** the system SHALL use `db.albums.update(id, { field: value })` to update only the specified fields

#### Scenario: Update track title
- **WHEN** updateTrack is called with a new title
- **THEN** the system SHALL use `db.albumTracks.update(id, { title })` to update the title field

### Requirement: Album tracks ordered retrieval
The system SHALL return album tracks sorted by trackIndex in ascending order using ProseQL's `sort` option.

#### Scenario: Get tracks for an album
- **WHEN** albumTracks endpoint is called with an albumId
- **THEN** the system SHALL query `db.albumTracks.query({ where: { albumId }, sort: { trackIndex: "asc" } })` using the albumId index

### Requirement: Player state persistence
The system SHALL persist player state (status, progress, duration, volume, updatedAt) as a single document with id "current" in the playerState collection, using ProseQL upsert semantics.

#### Scenario: Save player state
- **WHEN** schedulePlayerSave is called with player state
- **THEN** after the 1000ms debounce period, the system SHALL call `db.playerState.upsert({ where: { id: "current" }, create: {...}, update: {...} })`

#### Scenario: Load player state on startup
- **WHEN** loadPlayerState is called
- **THEN** the system SHALL call `db.playerState.findById("current")` and return the result, or undefined if `NotFoundError`

### Requirement: Queue state persistence with embedded items
The system SHALL persist queue state as a single document with id "current" containing currentIndex, contextType, contextId, and an embedded items array validated by a nested Effect Schema. This replaces the separate queue_items and queue_state tables.

#### Scenario: Save queue state
- **WHEN** scheduleQueueSave is called with queue items and context
- **THEN** after the debounce period, the system SHALL call `db.queueState.upsert()` with all items embedded in a nested array

#### Scenario: Load queue state on startup
- **WHEN** loadQueueState is called
- **THEN** the system SHALL call `db.queueState.findById("current")` and reconstruct QueueTrack objects from the embedded items array

### Requirement: Listen log append-only persistence
The system SHALL store listen history using a ProseQL collection configured with `appendOnly: true` and `.jsonl` file extension. New entries are appended as single JSONL lines; existing entries are never modified or deleted.

#### Scenario: Record a listen event
- **WHEN** a track finishes playing (>= 30s progress)
- **THEN** the system SHALL call `db.listenLog.create({ id, compositeId, title, artist, album, source })` which appends a single line to the JSONL file

#### Scenario: Query listen history with pagination
- **WHEN** listenLog.list is called with limit and offset
- **THEN** the system SHALL query `db.listenLog.query({ sort: { listenedAt: "desc" }, limit, offset })`

#### Scenario: Prevent mutation of listen history
- **WHEN** `update()` or `delete()` is called on the listenLog collection
- **THEN** ProseQL SHALL throw `OperationError` (enforced by appendOnly mode)

### Requirement: Playlist persistence
The system SHALL store playlists in a YAML collection indexed on `source`, supporting upsert semantics for radio station creation.

#### Scenario: Create a radio station playlist
- **WHEN** createRadio is called with a track seed
- **THEN** the system SHALL call `db.playlists.upsert({ where: { id: "radio-{seedTrackId}" }, create: {...}, update: {} })` with isRadio=true

#### Scenario: Load playlists by source
- **WHEN** the source manager queries playlists for "ytmusic"
- **THEN** the system SHALL query `db.playlists.query({ where: { source: "ytmusic" } })` using the source index

### Requirement: Track ID resolution from ProseQL
The system SHALL resolve bare nanoid track IDs to source:sourceTrackId composite IDs by querying the albumTracks ProseQL collection.

#### Scenario: Resolve a library track ID for streaming
- **WHEN** resolveTrackForStream is called with a bare nanoid
- **THEN** the system SHALL call `db.albumTracks.findById(opaqueId)` and return "{source}:{sourceTrackId}"
- **AND** catch `NotFoundError` for graceful error handling

#### Scenario: Resolve a source-prefixed track ID
- **WHEN** resolveTrackForStream is called with a "source:id" format
- **THEN** the system SHALL return it as-is without querying the database

### Requirement: Effect Schema validation on all collections
All data read from and written to ProseQL collections SHALL be validated against Effect Schemas with `exactOptionalPropertyTypes: true` compatibility (using `Schema.optionalWith(Schema.X, { exact: true })` for optional fields).

#### Scenario: Write data matching schema
- **WHEN** data matching the collection's Effect Schema is written
- **THEN** the write SHALL succeed and data SHALL be persisted to the YAML/JSONL file

#### Scenario: Read corrupted data
- **WHEN** a YAML/JSONL file contains data that does not match the Effect Schema
- **THEN** the system SHALL surface a validation error rather than silently returning malformed data

### Requirement: Transactional integrity for multi-collection writes
The system SHALL use ProseQL's `db.$transaction()` for operations that write to multiple collections atomically.

#### Scenario: Album save transaction succeeds
- **WHEN** all creates in a saveAlbum transaction succeed
- **THEN** all records SHALL be committed and `db.flush()` SHALL be called for immediate persistence

#### Scenario: Album save transaction fails
- **WHEN** any create in a saveAlbum transaction throws an error
- **THEN** all changes SHALL be rolled back — no partial album data persisted to disk
