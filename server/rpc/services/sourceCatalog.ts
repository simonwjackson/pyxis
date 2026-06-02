/**
 * @module server/rpc/services/sourceCatalog
 * Effect service that is the RPC-facing source contract seam. Handlers pass
 * Pyxis/domain ids (for example `ytmusic:album_1` or a library track nanoid)
 * and SourceCatalog owns source manager resolution, source-prefixed id
 * validation, source capability checks, and provider error mapping.
 */

import { createLogger } from "@shared/logger.js";
import type { SourceManager } from "@shared/sources/index.js";
import type {
  AlbumCapability,
  CanonicalAlbum,
  CanonicalPlaylist,
  CanonicalTrack,
  PlaylistCapability,
  SearchResult,
  Source,
  SourceType,
  StreamCapability,
} from "@shared/sources/types.js";
import {
  hasAlbumCapability,
  hasPlaylistCapability,
  hasStreamCapability,
} from "@shared/sources/types.js";
import { Context, Effect, Layer } from "effect";
import {
  buildStreamUrl,
  parseId,
  resolveTrackSource,
  type TrackCapabilities,
  trackCapabilities,
} from "../../lib/ids.js";
import { getPandoraSessionFromCredentials } from "../../services/credentials.js";
import {
  ensureSourceManager,
  getSourceManager as resolveSourceManagerForSession,
} from "../../services/sourceManager.js";
import {
  NotFound,
  type PublicError,
  SourceUnavailable,
  UpstreamProviderError,
  ValidationError,
} from "../errors.js";
import { mapUnknownError } from "../sourceErrorMap.js";

const log = createLogger("server").child({ component: "rpc.sourceCatalog" });

type SourceIdParts = {
  readonly source: SourceType;
  readonly id: string;
};

/**
 * Effect surface exposed to RPC handlers. Methods accept domain ids instead
 * of resolved SourceManager instances or handler-parsed source/raw-id pairs.
 */
export type SourceCatalogShape = {
  readonly listPlaylists: () => Effect.Effect<
    readonly CanonicalPlaylist[],
    PublicError
  >;
  readonly getPlaylistTracks: (
    playlistId: string,
  ) => Effect.Effect<readonly CanonicalTrack[], PublicError>;
  readonly searchAll: (
    query: string,
  ) => Effect.Effect<SearchResult, PublicError>;
  readonly getAlbumTracks: (albumId: string) => Effect.Effect<
    {
      readonly album: CanonicalAlbum;
      readonly tracks: readonly CanonicalTrack[];
    },
    PublicError
  >;
  readonly getStreamUrl: (
    trackId: string,
    nextTrackId?: string,
  ) => Effect.Effect<string, PublicError>;
  readonly getTrackCapabilities: (
    trackId: string,
  ) => Effect.Effect<TrackCapabilities, PublicError>;

  /**
   * Transitional escape hatch for library-save code that still needs the
   * existing Library service signature. New source operations should prefer
   * the domain-id methods above.
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
  /** Resolve the source manager for the request. */
  readonly resolveManager: () => Promise<SourceManager>;
};

function sourceManagerEffect(
  behavior: SourceCatalogBehavior,
): Effect.Effect<SourceManager, PublicError> {
  return Effect.tryPromise({
    try: () => behavior.resolveManager(),
    catch: (cause) => {
      log.error({ err: cause }, "failed to resolve source manager");
      return new UpstreamProviderError({ source: "pandora" });
    },
  });
}

function parseRequiredSourceId(
  opaqueId: string,
  field: string,
  code: string,
): Effect.Effect<SourceIdParts, PublicError> {
  const parsed = parseId(opaqueId);
  if (!parsed.source) {
    return Effect.fail(new ValidationError({ code, field }));
  }
  return Effect.succeed({ source: parsed.source, id: parsed.id });
}

function sourceUnavailable(
  source: SourceType,
  capability: "album" | "playlist" | "stream",
): SourceUnavailable {
  return new SourceUnavailable({
    source,
    code: `${source}_${capability}_unsupported`,
  });
}

function existingSource(
  manager: SourceManager,
  sourceType: SourceType,
): Effect.Effect<Source, PublicError> {
  const source = manager.getSource(sourceType);
  return source
    ? Effect.succeed(source)
    : Effect.fail(sourceUnavailable(sourceType, "stream"));
}

function playlistSource(
  manager: SourceManager,
  sourceType: SourceType,
): Effect.Effect<Source & PlaylistCapability, PublicError> {
  const source = manager.getSource(sourceType);
  return source && hasPlaylistCapability(source)
    ? Effect.succeed(source)
    : Effect.fail(sourceUnavailable(sourceType, "playlist"));
}

function albumSource(
  manager: SourceManager,
  sourceType: SourceType,
): Effect.Effect<Source & AlbumCapability, PublicError> {
  const source = manager.getSource(sourceType);
  return source && hasAlbumCapability(source)
    ? Effect.succeed(source)
    : Effect.fail(sourceUnavailable(sourceType, "album"));
}

function streamSource(
  manager: SourceManager,
  sourceType: SourceType,
): Effect.Effect<Source & StreamCapability, PublicError> {
  const source = manager.getSource(sourceType);
  return source && hasStreamCapability(source)
    ? Effect.succeed(source)
    : Effect.fail(sourceUnavailable(sourceType, "stream"));
}

function mapSourceCallError(
  op: string,
  source: SourceType | undefined,
  cause: unknown,
): PublicError {
  log.warn({ err: cause, op, source }, "source catalog call failed");
  if (cause instanceof SourceUnavailable) return cause;
  if (cause instanceof ValidationError) return cause;
  if (cause instanceof Error && /not.*found|unknown/i.test(cause.message)) {
    return new NotFound({ resource: op });
  }
  if (source) return new UpstreamProviderError({ source });
  return mapUnknownError(cause);
}

function trySourcePromise<A>(
  op: string,
  source: SourceType | undefined,
  thunk: () => Promise<A>,
): Effect.Effect<A, PublicError> {
  return Effect.tryPromise({
    try: thunk,
    catch: (cause) => mapSourceCallError(op, source, cause),
  });
}

function resolveOpaqueTrackSource(
  trackId: string,
): Effect.Effect<SourceType, PublicError> {
  return Effect.tryPromise({
    try: () => resolveTrackSource(trackId),
    catch: (cause) => mapSourceCallError("track.source", undefined, cause),
  });
}

function makeShape(behavior: SourceCatalogBehavior): SourceCatalogShape {
  const resolveManager = sourceManagerEffect(behavior);

  return {
    listPlaylists: () =>
      Effect.gen(function* () {
        const manager = yield* resolveManager;
        const playlists: CanonicalPlaylist[] = [];
        for (const source of manager.getAllSources()) {
          if (!hasPlaylistCapability(source)) continue;
          const sourcePlaylists = yield* trySourcePromise(
            "library.playlists.list",
            source.type,
            () => source.listPlaylists(),
          );
          playlists.push(...sourcePlaylists);
        }
        return playlists;
      }),

    getPlaylistTracks: (playlistId) =>
      Effect.gen(function* () {
        const parsed = yield* parseRequiredSourceId(
          playlistId,
          "id",
          "playlist_id_requires_source_prefix",
        );
        const manager = yield* resolveManager;
        const source = yield* playlistSource(manager, parsed.source);
        return yield* trySourcePromise("playlist.tracks", parsed.source, () =>
          source.getPlaylistTracks(parsed.id),
        );
      }),

    searchAll: (query) =>
      Effect.gen(function* () {
        const manager = yield* resolveManager;
        return yield* trySourcePromise("search.all", undefined, () =>
          manager.searchAll(query),
        );
      }),

    getAlbumTracks: (albumId) =>
      Effect.gen(function* () {
        const parsed = yield* parseRequiredSourceId(
          albumId,
          "id",
          "album_id_requires_source_prefix",
        );
        const manager = yield* resolveManager;
        const source = yield* albumSource(manager, parsed.source);
        return yield* trySourcePromise("album.tracks", parsed.source, () =>
          source.getAlbumTracks(parsed.id),
        );
      }),

    getStreamUrl: (trackId, nextTrackId) =>
      Effect.gen(function* () {
        const manager = yield* resolveManager;
        const source = yield* resolveOpaqueTrackSource(trackId);
        yield* streamSource(manager, source);
        if (nextTrackId) {
          const nextSource = yield* resolveOpaqueTrackSource(nextTrackId);
          yield* existingSource(manager, nextSource);
        }
        return buildStreamUrl(trackId, nextTrackId);
      }),

    getTrackCapabilities: (trackId) =>
      Effect.gen(function* () {
        const manager = yield* resolveManager;
        const source = yield* resolveOpaqueTrackSource(trackId);
        yield* existingSource(manager, source);
        return trackCapabilities(source);
      }),

    resolveManager,
  };
}

/** Build a SourceCatalog layer from a behavior. */
export function SourceCatalogLayerFromBehavior(
  behavior: SourceCatalogBehavior,
): Layer.Layer<SourceCatalog> {
  return Layer.sync(SourceCatalog)(() => makeShape(behavior));
}

/** Live SourceCatalog layer. */
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
