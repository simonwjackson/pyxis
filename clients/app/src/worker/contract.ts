/// The worker boundary.
///
/// This file is the documented API a client UI builds against. Treat it as public: it must
/// stay free of view concerns, and it must not leak how storage happens underneath.
///
/// The split exists because offline correctness is a distributed-systems problem rather
/// than a design problem. Everything that has to be right whether or not the network is
/// there lives below this line. Everything above it renders.

import type {
  ListenTrackEventInput,
  RpcLibraryAlbum,
  RpcPlacement,
  RpcSession,
  RpcSessionCommand,
} from "../../../../contracts/generated/pyxis"

/// Bumped whenever the stored shape changes. An existing database at a lower version is
/// migrated in order. A database at a higher version belongs to a newer build, which this
/// one cannot understand, so it is reset rather than guessed at.
export const WORKER_SCHEMA_VERSION = 7

export const WORKER_DATABASE_NAME = "pyxis-worker"

/// One row, so the version is readable without decoding anything else.
export const SCHEMA_ROW_ID = "schema"

/// One row. A device has exactly one identity and one set of credentials.
export const SETTINGS_ROW_ID = "device"

export const SESSION_CHANGED_DURING_CONFIRMATION =
  "session changed while command was being confirmed"

export interface WorkerCommandReceipt {
  readonly id: string
  readonly sessionId: string
  readonly fingerprint: string
}

export interface WorkerSchemaRow {
  readonly id: string
  readonly version: number
}

/// Device-local state.
///
/// The bearer token lives here because a PWA has to survive a reload without asking the
/// person to pair again. It is device-local storage on a device they already unlocked, and
/// it is exactly as sensitive as the session it represents. It is never synced.
export type WorkerSyncNotice =
  | {
      readonly id: string
      readonly kind: "conflict"
      readonly albumId: string
      readonly kept: RpcPlacement | "removed"
      readonly discarded: RpcPlacement
    }
  | {
      readonly id: string
      readonly kind: "dropped"
      readonly writeId: string
      readonly reason: string
    }

export interface WorkerSettings {
  readonly id: string
  readonly deviceId?: string
  readonly accountId?: string
  readonly accountName?: string
  readonly accountIsDefault?: boolean
  readonly accountCreatedAt?: string
  readonly deviceName?: string
  readonly bearerToken?: string
  /// Opaque realtime cursor. Persisted so a reload resumes instead of refetching.
  readonly resumeToken?: string
  /// Durable user-visible outcomes. Bounded to the newest 100 notices.
  readonly syncNotices?: readonly WorkerSyncNotice[]
}

export type WorkerAlbum = RpcLibraryAlbum & { readonly id: string }
export type WorkerSession = RpcSession & { readonly id: string }

export interface WorkerSessionCommandPreview {
  readonly session: WorkerSession
  /// True when this command ID was already durably accepted locally. A caller must not
  /// repeat renderer side effects for it.
  readonly replayed: boolean
}

/// A write made locally that the server has not accepted yet.
///
/// Queued writes are the only data on a device that exists nowhere else, so they are the
/// one thing sync may never drop silently.
export type WorkerOutboxEntry = {
  /// Monotonic local ULID. Sorts in creation order and never trusts a public ID to do so.
  readonly id: string
  readonly createdAt: string
  readonly attempts: number
  readonly lastError?: string
} & (
  | {
      readonly kind: "album.placement"
      readonly albumId: string
      readonly placement: RpcPlacement
      /// Revision the change was made on top of. Used to tell a clean replay from a
      /// genuine two-device conflict.
      readonly baseRevision: number
      readonly basePlacement: RpcPlacement
    }
  | {
      readonly kind: "listen.append"
      readonly event: ListenTrackEventInput
    }
  | {
      readonly kind: "session.command"
      readonly sessionId: string
      /// Idempotency key sent to the core. Separate from the monotonic local queue key.
      readonly commandId: string
      readonly baseRevision: number
      /// Exact optimistic result written after this outbox entry. Lets recovery distinguish
      /// an applied command from an unrelated later revision when receipt creation was
      /// interrupted.
      readonly resultFingerprint?: string
      readonly command: RpcSessionCommand
    }
)

/// What happened to one queued write.
export type OutboxResult =
  /// Accepted by the server.
  | "pushed"
  /// The server already had this exact state. A replay, not a change.
  | "converged"
  /// Another device changed the same record. Resolved by rule and reported.
  | "conflicted"
  /// Rejected permanently. Dropped so it cannot block everything behind it.
  | "dropped"
  /// Could not reach the server. Stays queued.
  | "deferred"

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
  /// Store a server verdict even when it rolls back optimistic local state.
  replaceAlbum(album: WorkerAlbum): Promise<WorkerAlbum>
  removeAlbum(id: string): Promise<boolean>
  sessions(): Promise<readonly WorkerSession[]>
  session(id: string): Promise<WorkerSession | undefined>
  putSession(session: WorkerSession): Promise<WorkerSession>
  /// Store a server verdict even when it rolls back an optimistic local revision.
  replaceSession(session: WorkerSession): Promise<WorkerSession>
  removeSession(id: string): Promise<boolean>
  /// Validate against the latest local session and detect an idempotent replay before a
  /// host performs renderer side effects.
  previewSessionCommand(
    sessionId: string,
    command: RpcSessionCommand,
    commandId: string,
  ): Promise<WorkerSessionCommandPreview>
  /// Apply a session command immediately and preserve it for idempotent replay.
  queueSessionCommand(
    session: WorkerSession,
    command: RpcSessionCommand,
    commandId?: string,
    expectedRevision?: number,
  ): Promise<WorkerSession>
  /// Apply a placement immediately and preserve the write for the next sync.
  queuePlacement(album: WorkerAlbum, placement: RpcPlacement): Promise<WorkerAlbum>
  /// Preserve one completed listen for idempotent replay.
  queueListen(event: ListenTrackEventInput): Promise<void>
  /// Queued writes in creation order.
  outbox(): Promise<readonly WorkerOutboxEntry[]>
  enqueue(entry: WorkerOutboxEntry): Promise<WorkerOutboxEntry>
  /// Record a failed attempt so a poison entry becomes visible instead of retrying
  /// silently forever.
  recordAttempt(id: string, error: string): Promise<void>
  dequeue(id: string): Promise<boolean>
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
  readonly sessions: WorkerCollection<WorkerSession>
  readonly commandReceipts: WorkerCollection<WorkerCommandReceipt>
  readonly outbox: WorkerCollection<WorkerOutboxEntry>
  close(): Promise<void>
}

/// Applied in ascending order to move a database from one version to the next.
export type WorkerMigration = (engine: WorkerEngine) => Promise<void>

/// Keyed by the version being migrated *to*.
export type WorkerMigrations = Readonly<Record<number, WorkerMigration>>

export const WORKER_MIGRATIONS: WorkerMigrations = {
  /// Version 2 added the outbox. A collection with no rows needs no data moved, so this
  /// step exists to say that explicitly. A missing entry would reset the database and
  /// throw away exactly the queued writes the outbox is for.
  2: async () => undefined,
  /// Version 3 persists the full account grant so a reload reuses its device token instead
  /// of claiming a new device. The new settings fields are optional, so old rows need no
  /// rewrite.
  3: async () => undefined,
  /// Version 4 adds device-hosted session snapshots and their offline command outbox.
  4: async () => undefined,
  /// Version 5 persists conflict and rejected-write notices across reloads.
  5: async () => undefined,
  /// Version 6 keeps directive IDs after their outbox entries drain.
  6: async () => undefined,
  /// Version 7 fingerprints optimistic session results. Existing outbox rows remain valid;
  /// their missing fingerprint is conservatively re-confirmed rather than guessed applied.
  7: async () => undefined,
}
