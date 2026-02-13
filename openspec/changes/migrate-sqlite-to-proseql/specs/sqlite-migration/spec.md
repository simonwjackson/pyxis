## ADDED Requirements

### Requirement: Automatic SQLite to ProseQL migration on startup
The system SHALL automatically migrate data from an existing SQLite database to ProseQL YAML/JSONL files on first startup after the code update. The migration MUST be idempotent — running it when YAML files already exist SHALL be a no-op.

#### Scenario: First startup with existing SQLite data
- **WHEN** the server starts and `pyxis.db` exists but no YAML collection files exist
- **THEN** the system SHALL read all data from SQLite, write it to ProseQL YAML/JSONL files, and rename `pyxis.db` to `pyxis.db.bak`

#### Scenario: First startup with no existing data
- **WHEN** the server starts and neither `pyxis.db` nor YAML files exist
- **THEN** the system SHALL skip migration and initialize empty ProseQL collections

#### Scenario: Startup after successful migration
- **WHEN** the server starts and YAML files already exist (migration previously completed)
- **THEN** the system SHALL skip migration and load data from existing YAML/JSONL files

### Requirement: Queue data consolidation during migration
During migration, the system SHALL merge data from the separate `queue_items` and `queue_state` SQLite tables into a single ProseQL `queueState` document with an embedded items array.

#### Scenario: Migrate queue with items
- **WHEN** SQLite contains queue_state and queue_items rows
- **THEN** the migrated queueState document SHALL contain the queue metadata (currentIndex, contextType, contextId) with items embedded as an ordered array

#### Scenario: Migrate empty queue
- **WHEN** SQLite contains a queue_state row but no queue_items
- **THEN** the migrated queueState document SHALL contain an empty items array

### Requirement: SQLite backup preservation
The migration process SHALL preserve the original SQLite database file by renaming it rather than deleting it, enabling manual rollback if needed.

#### Scenario: Backup during migration
- **WHEN** migration completes successfully
- **THEN** `pyxis.db` SHALL be renamed to `pyxis.db.bak` in the same directory

#### Scenario: Backup already exists
- **WHEN** migration runs but `pyxis.db.bak` already exists
- **THEN** the system SHALL NOT overwrite the existing backup (skip rename)

### Requirement: Standalone migration script
The system SHALL provide a standalone migration script at `server/scripts/migrate-sqlite.ts` that can be run manually via `bun server/scripts/migrate-sqlite.ts` for users who want to migrate before upgrading the server.

#### Scenario: Run migration script manually
- **WHEN** user runs the migration script while SQLite data exists
- **THEN** the script SHALL migrate all data and report success with counts of migrated records per collection
