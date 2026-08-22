/// The worker boundary.
///
/// This file is the documented API a client UI builds against. Treat it as public: it must
/// stay free of view concerns, and it must not leak how storage happens underneath.
///
/// The split exists because offline correctness is a distributed-systems problem rather
/// than a design problem. Everything that has to be right whether or not the network is
/// there lives below this line. Everything above it renders.

import type { RpcLibraryAlbum } from "../../../../contracts/generated/pyxis"

/// Bumped whenever the stored shape changes. An existing database at a lower version is
/// migrated in order. A database at a higher version belongs to a newer build, which this
/// one cannot understand, so it is reset rather than guessed at.
export const WORKER_SCHEMA_VERSION = 1

export const WORKER_DATABASE_NAME = "pyxis-worker"

/// One row, so the version is readable without decoding anything else.
export const SCHEMA_ROW_ID = "schema"

/// One row. A device has exactly one identity and one set of credentials.
export const SETTINGS_ROW_ID = "device"

export interface WorkerSchemaRow {
  readonly id: string
  readonly version: number
}

/// Device-local state.
///
/// The bearer token lives here because a PWA has to survive a reload without asking the
/// person to pair again. It is device-local storage on a device they already unlocked, and
/// it is exactly as sensitive as the session it represents. It is never synced.
export interface WorkerSettings {
  readonly id: string
  readonly deviceId?: string
  readonly accountId?: string
  readonly bearerToken?: string
  /// Opaque realtime cursor. Persisted so a reload resumes instead of refetching.
  readonly resumeToken?: string
}

export type WorkerAlbum = RpcLibraryAlbum & { readonly id: string }

/// Why a freshly opened database has no data.
export type WorkerOpenReason =
  /// First run on this device.
  | "created"
  /// Existing data was readable and is intact.
  | "opened"
  /// Existing data was migrated forward from an older schema version.
  | "migrated"
  /// Existing data was unreadable or from a newer build, and was discarded. The caller
  /// must refetch everything rather than trusting what is here.
  | "reset"

export interface WorkerOpenReport {
  readonly reason: WorkerOpenReason
  readonly fromVersion?: number
  readonly version: number
  /// True when this store keeps nothing after the page closes. Set by environments with no
  /// worker or no IndexedDB, where the alternative would be refusing to run at all. A
  /// client must not promise offline support while this is true.
  readonly ephemeral?: boolean
}

/// What a UI may ask of local storage.
///
/// Every method resolves against local data and never touches the network. Sync is a
/// separate concern layered on top, so a component reading this can be certain it will not
/// block on a request.
export interface WorkerDatabase {
  readonly report: WorkerOpenReport
  settings(): Promise<WorkerSettings>
  writeSettings(patch: Omit<Partial<WorkerSettings>, "id">): Promise<WorkerSettings>
  albums(): Promise<readonly WorkerAlbum[]>
  album(id: string): Promise<WorkerAlbum | undefined>
  /// Replace the whole local library. Used after a full refetch.
  replaceAlbums(albums: readonly WorkerAlbum[]): Promise<void>
  /// Insert or update one album, keeping the higher revision.
  putAlbum(album: WorkerAlbum): Promise<WorkerAlbum>
  removeAlbum(id: string): Promise<boolean>
  close(): Promise<void>
}

/// The storage primitives the database is built from.
///
/// Narrow on purpose. A ProseQL engine satisfies it, and so does an in-memory fake, which
/// is what keeps the database's own logic testable without a browser.
export interface WorkerCollection<T extends { readonly id: string }> {
  findById(id: string): Promise<T | undefined>
  all(): Promise<readonly T[]>
  upsert(row: T): Promise<T>
  delete(id: string): Promise<boolean>
}

export interface WorkerEngine {
  readonly meta: WorkerCollection<WorkerSchemaRow>
  readonly settings: WorkerCollection<WorkerSettings>
  readonly albums: WorkerCollection<WorkerAlbum>
  close(): Promise<void>
}

/// Applied in ascending order to move a database from one version to the next.
export type WorkerMigration = (engine: WorkerEngine) => Promise<void>

/// Keyed by the version being migrated *to*.
export type WorkerMigrations = Readonly<Record<number, WorkerMigration>>

/// No migrations exist yet, because version 1 is the first shipped schema. The mechanism
/// is exercised by its own tests so that the first real bump is not also the first time
/// the upgrade path runs.
export const WORKER_MIGRATIONS: WorkerMigrations = {}
