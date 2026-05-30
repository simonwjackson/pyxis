/**
 * @module server/rpc/services/sourceCatalog
 * Effect service that wraps the {@link SourceManager} aggregate so RPC
 * handlers consume a typed Effect surface instead of a Promise-based
 * interface. The live layer pulls the current source manager from
 * {@link AuthSession} so authenticated and unauthenticated requests share
 * one production source aggregator.
 */

import { Context, Effect, Layer } from "effect";
import { createLogger } from "@shared/logger.js";
import type { SourceManager } from "@shared/sources/index.js";
import type {
  CanonicalAlbum,
  CanonicalPlaylist,
  CanonicalTrack,
  SearchResult,
  SourceType,
} from "@shared/sources/types.js";
import { getPandoraSessionFromCredentials } from "../../services/credentials.js";
import {
  ensureSourceManager,
  getSourceManager as resolveSourceManagerForSession,
} from "../../services/sourceManager.js";
import {
  NotFound,
  type PublicError,
  UpstreamProviderError,
} from "../errors.js";
import { mapUnknownError } from "../sourceErrorMap.js";

const log = createLogger("server").child({ component: "rpc.sourceCatalog" });

/**
 * Effect surface exposed to RPC handlers. Methods take a resolved
 * `SourceManager` argument so handlers can layer auth retry on top.
 */
export type SourceCatalogShape = {
  readonly listPlaylists: (
    manager: SourceManager,
  ) => Effect.Effect<readonly CanonicalPlaylist[], PublicError>;
  readonly getPlaylistTracks: (
    manager: SourceManager,
    source: SourceType,
    playlistId: string,
  ) => Effect.Effect<readonly CanonicalTrack[], PublicError>;
  readonly searchAll: (
    manager: SourceManager,
    query: string,
  ) => Effect.Effect<SearchResult, PublicError>;
  readonly getAlbumTracks: (
    manager: SourceManager,
    source: SourceType,
    albumId: string,
  ) => Effect.Effect<
    {
      readonly album: CanonicalAlbum;
      readonly tracks: readonly CanonicalTrack[];
    },
    PublicError
  >;
  readonly getStreamUrl: (
    manager: SourceManager,
    source: SourceType,
    trackId: string,
  ) => Effect.Effect<string, PublicError>;

  /**
   * Resolve the active source manager for this request. Equivalent to
   * `AuthSession.getSourceManager` but exposed here for handlers that only
   * depend on SourceCatalog.
   */
  readonly resolveManager: Effect.Effect<SourceManager, PublicError>;
};

/** Effect Context.Service tag for {@link SourceCatalogShape}. */
export class SourceCatalog extends Context.Service<
  SourceCatalog,
  SourceCatalogShape
>()("Pyxis/SourceCatalog") {}

/** Behavior knobs for an in-memory source catalog layer. */
export type SourceCatalogBehavior = {
  /** Resolve the source manager for the request (used by `resolveManager`). */
  readonly resolveManager: () => Promise<SourceManager>;
};

function wrap<A>(
  op: string,
  thunk: () => Promise<A>,
): Effect.Effect<A, PublicError> {
  return Effect.tryPromise({
    try: thunk,
    catch: (cause) => {
      log.warn({ err: cause, op }, "source manager call failed");
      if (cause instanceof Error && /not.*found/i.test(cause.message)) {
        return new NotFound({ resource: op });
      }
      return mapUnknownError(cause);
    },
  });
}

function makeShape(behavior: SourceCatalogBehavior): SourceCatalogShape {
  return {
    listPlaylists: (manager) =>
      wrap("playlist.list", () => Promise.resolve(manager.listAllPlaylists())),
    getPlaylistTracks: (manager, source, playlistId) =>
      wrap("playlist.tracks", () =>
        manager.getPlaylistTracks(source, playlistId),
      ),
    searchAll: (manager, query) =>
      wrap("search.all", () => manager.searchAll(query)),
    getAlbumTracks: (manager, source, albumId) =>
      wrap("album.tracks", () => manager.getAlbumTracks(source, albumId)),
    getStreamUrl: (manager, source, trackId) =>
      wrap("stream.url", () => manager.getStreamUrl(source, trackId)),
    resolveManager: Effect.tryPromise({
      try: () => behavior.resolveManager(),
      catch: (cause) => {
        log.error({ err: cause }, "failed to resolve source manager");
        return new UpstreamProviderError({ source: "pandora" });
      },
    }),
  };
}

/** Build a SourceCatalog layer from a behavior. */
export function SourceCatalogLayerFromBehavior(
  behavior: SourceCatalogBehavior,
): Layer.Layer<SourceCatalog> {
  return Layer.sync(SourceCatalog)(() => makeShape(behavior));
}

/**
 * Live SourceCatalog layer. Delegates manager resolution to the same module
 * helpers used by {@link AuthSession.getSourceManager}, so production
 * handlers observe the same session/source aggregator no matter which
 * service tag they resolve through.
 */
export const SourceCatalogLayerLive: Layer.Layer<SourceCatalog> = Layer.sync(
  SourceCatalog,
)(() =>
  makeShape({
    resolveManager: async () => {
      const session = getPandoraSessionFromCredentials();
      return session
        ? resolveSourceManagerForSession(session)
        : ensureSourceManager();
    },
  }),
);
