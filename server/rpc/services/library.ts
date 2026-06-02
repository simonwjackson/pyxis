/**
 * @module server/rpc/services/library
 * Effect service wrapping the placement-aware library album behavior in
 * `server/services/libraryAlbums.ts`. The live layer reads from the same DB
 * instance the existing routers use, so save/place/list semantics stay
 * identical for the cutover.
 */

import type { AlbumPlacement } from "@shared/db/config.js";
import { type DbInstance, getDb } from "@shared/db/index.js";
import { createLogger } from "@shared/logger.js";
import type { SourceManager } from "@shared/sources/index.js";
import { Context, Effect, Layer } from "effect";
import { parseId } from "../../lib/ids.js";
import {
  type AlbumRelationshipPolicy,
  getConfiguredAlbumRelationshipPolicy,
} from "../../services/albumRelationshipPolicy.js";
import {
  getLibraryAlbum,
  type LibraryAlbumView,
  listLibraryAlbums,
  type ResolvedAlbumState,
  resolveAlbumStatesForSourceIds,
  saveAlbumToLibrary,
  setAlbumPlacement,
} from "../../services/libraryAlbums.js";
import {
  NotFound,
  PersistenceError,
  type PublicError,
  ValidationError,
} from "../errors.js";
import { mapUnknownError } from "../sourceErrorMap.js";

const log = createLogger("server").child({ component: "rpc.library" });

/** Options accepted by `Library.list`. */
export type ListLibraryAlbumsOptions = {
  readonly placements?: readonly AlbumPlacement[] | undefined;
  readonly includeArchive?: boolean | undefined;
  readonly includeDismissed?: boolean | undefined;
  readonly hotOnly?: boolean | undefined;
  readonly now?: number | undefined;
  readonly policy?: AlbumRelationshipPolicy | undefined;
};

/**
 * Service shape: every method returns the existing
 * {@link LibraryAlbumView}/{@link ResolvedAlbumState} types so the wire
 * encoders in U4 can rely on the same field names.
 */
export type LibraryShape = {
  readonly list: (
    options?: ListLibraryAlbumsOptions,
  ) => Effect.Effect<readonly LibraryAlbumView[], PublicError>;
  readonly get: (
    albumId: string,
  ) => Effect.Effect<LibraryAlbumView | null, PublicError>;
  readonly resolveStates: (
    sourceIds: readonly string[],
  ) => Effect.Effect<readonly ResolvedAlbumState[], PublicError>;
  readonly save: (
    sourceAlbumId: string,
    sourceManager: Pick<SourceManager, "getAlbumTracks">,
  ) => Effect.Effect<
    {
      readonly id: string;
      readonly outcome: "created" | "restored" | "existing";
      readonly placement: AlbumPlacement;
    },
    PublicError
  >;
  readonly setPlacement: (
    albumId: string,
    placement: AlbumPlacement,
  ) => Effect.Effect<LibraryAlbumView, PublicError>;
};

/** Effect Context.Service tag for {@link LibraryShape}. */
export class Library extends Context.Service<Library, LibraryShape>()(
  "Pyxis/Library",
) {}

/** Configurable behavior for an in-memory Library layer used by tests. */
export type LibraryBehavior = {
  readonly db: DbInstance | (() => Promise<DbInstance>);
  /** Optional clock override for placement timestamps. */
  readonly now?: () => number;
  /** Optional id factory for created albums. */
  readonly createId?: () => string;
  /** Optional policy override for placement + Hot read-model behavior. */
  readonly policy?: AlbumRelationshipPolicy | (() => AlbumRelationshipPolicy);
};

function resolveDb(
  db: DbInstance | (() => Promise<DbInstance>),
): Effect.Effect<DbInstance, PublicError> {
  if (typeof db === "function") {
    return Effect.tryPromise({
      try: () => db(),
      catch: (cause) => {
        log.error({ err: cause }, "failed to resolve database");
        return new PersistenceError({ code: "db_unavailable" });
      },
    });
  }
  return Effect.succeed(db);
}

function resolvePolicy(
  policy: AlbumRelationshipPolicy | (() => AlbumRelationshipPolicy) | undefined,
): AlbumRelationshipPolicy | undefined {
  return typeof policy === "function" ? policy() : policy;
}

function makeShape(behavior: LibraryBehavior): LibraryShape {
  const now = behavior.now;
  const createId = behavior.createId;

  const list: LibraryShape["list"] = (options) =>
    Effect.gen(function* () {
      const db = yield* resolveDb(behavior.db);
      const policy = resolvePolicy(behavior.policy);
      const merged: ListLibraryAlbumsOptions = {
        ...(options ?? {}),
        ...(now !== undefined && options?.now === undefined
          ? { now: now() }
          : {}),
        ...(policy !== undefined && options?.policy === undefined
          ? { policy }
          : {}),
      };
      return yield* Effect.tryPromise({
        try: () => listLibraryAlbums(db, merged),
        catch: (cause) => {
          log.error({ err: cause }, "library.list failed");
          return new PersistenceError({ code: "library_list_failed" });
        },
      });
    });

  const get: LibraryShape["get"] = (albumId) =>
    Effect.gen(function* () {
      if (!albumId || albumId.length === 0) {
        return yield* Effect.fail(
          new ValidationError({ code: "album_id_required", field: "id" }),
        );
      }
      const db = yield* resolveDb(behavior.db);
      const policy = resolvePolicy(behavior.policy);
      const options = {
        ...(now !== undefined ? { now: now() } : {}),
        ...(policy !== undefined ? { policy } : {}),
      };
      return yield* Effect.tryPromise({
        try: () => getLibraryAlbum(db, albumId, options),
        catch: (cause) => {
          log.error({ err: cause }, "library.get failed");
          return new PersistenceError({ code: "library_get_failed" });
        },
      });
    });

  const resolveStates: LibraryShape["resolveStates"] = (sourceIds) =>
    Effect.gen(function* () {
      const db = yield* resolveDb(behavior.db);
      const policy = resolvePolicy(behavior.policy);
      const options = {
        ...(now !== undefined ? { now: now() } : {}),
        ...(policy !== undefined ? { policy } : {}),
      };
      return yield* Effect.tryPromise({
        try: () => resolveAlbumStatesForSourceIds(db, sourceIds, options),
        catch: (cause) => {
          log.error({ err: cause }, "library.resolveStates failed");
          return new PersistenceError({
            code: "library_resolve_states_failed",
          });
        },
      });
    });

  const save: LibraryShape["save"] = (sourceAlbumId, sourceManager) =>
    Effect.gen(function* () {
      const parsed = parseId(sourceAlbumId);
      if (!parsed.source) {
        return yield* Effect.fail(
          new ValidationError({
            code: "save_album_requires_source_prefixed_id",
            field: "id",
          }),
        );
      }
      const db = yield* resolveDb(behavior.db);
      const policy = resolvePolicy(behavior.policy);
      const options: {
        readonly now?: number | undefined;
        readonly policy?: AlbumRelationshipPolicy | undefined;
        readonly createId?: (() => string) | undefined;
      } = {
        ...(now !== undefined ? { now: now() } : {}),
        ...(policy !== undefined ? { policy } : {}),
        ...(createId !== undefined ? { createId } : {}),
      };
      const result = yield* Effect.tryPromise({
        try: () =>
          saveAlbumToLibrary(db, sourceManager, sourceAlbumId, options),
        catch: (cause) => {
          log.error({ err: cause, id: sourceAlbumId }, "library.save failed");
          // `saveAlbumToLibrary` may surface either a persistence failure or
          // an upstream provider error. Provider errors carry the source
          // prefix so we surface UpstreamProviderError when we can detect
          // it; otherwise fall back to the generic mapper.
          if (
            cause instanceof Error &&
            /source ref points to missing/.test(cause.message)
          ) {
            return new PersistenceError({
              code: "album_ref_missing_album",
            });
          }
          return mapUnknownError(cause);
        },
      });
      // Flush DB now so callers see the saved state immediately, matching
      // the existing router behavior.
      yield* Effect.tryPromise({
        try: () => db.flush(),
        catch: (cause) => {
          log.warn({ err: cause }, "library.save flush failed");
          return new PersistenceError({ code: "library_flush_failed" });
        },
      });
      return result;
    });

  const setPlacementEff: LibraryShape["setPlacement"] = (albumId, placement) =>
    Effect.gen(function* () {
      if (!albumId || albumId.length === 0) {
        return yield* Effect.fail(
          new ValidationError({
            code: "album_id_required",
            field: "albumId",
          }),
        );
      }
      const db = yield* resolveDb(behavior.db);
      const policy = resolvePolicy(behavior.policy);
      const options = {
        ...(now !== undefined ? { now: now() } : {}),
        ...(policy !== undefined ? { policy } : {}),
      };
      const updated = yield* Effect.tryPromise({
        try: () => setAlbumPlacement(db, albumId, placement, options),
        catch: (cause) => {
          if (cause instanceof Error && /not found/i.test(cause.message)) {
            return new NotFound({ resource: "album" });
          }
          log.error({ err: cause }, "library.setPlacement failed");
          return new PersistenceError({
            code: "library_set_placement_failed",
          });
        },
      });
      yield* Effect.tryPromise({
        try: () => db.flush(),
        catch: (cause) => {
          log.warn({ err: cause }, "library.setPlacement flush failed");
          return new PersistenceError({ code: "library_flush_failed" });
        },
      });
      return updated;
    });

  return {
    list,
    get,
    resolveStates,
    save,
    setPlacement: setPlacementEff,
  };
}

/** Build a Library layer from a configurable behavior. */
export function LibraryLayerFromBehavior(
  behavior: LibraryBehavior,
): Layer.Layer<Library> {
  return Layer.sync(Library)(() => makeShape(behavior));
}

/** Live Library layer backed by the application database. */
export const LibraryLayerLive: Layer.Layer<Library> = Layer.sync(Library)(() =>
  makeShape({
    db: () => getDb(),
    policy: getConfiguredAlbumRelationshipPolicy,
  }),
);
