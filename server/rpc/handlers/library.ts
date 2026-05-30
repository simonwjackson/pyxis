/**
 * @module server/rpc/handlers/library
 * Effect RPC handlers for the `library.*` family. Mirrors
 * `server/routers/library.ts`, delegating placement-aware queries through
 * the {@link Library} service and Pandora bookmark calls through
 * {@link AuthSession.withAuthRetry}.
 */

import { Effect } from "effect";
import type {
  ApiAddBookmarkInput,
  ApiHotAlbumsInput,
  ApiLibraryAlbumIdInput,
  ApiLibraryAlbumTracksInput,
  ApiListLibraryAlbumsInput,
  ApiRemoveBookmarkInput,
  ApiRemoveLibraryAlbumInput,
  ApiResolveAlbumStatesInput,
  ApiSaveAlbumInput,
  ApiSetAlbumPlacementInput,
  ApiUpdateAlbumInput,
  ApiUpdateLibraryTrackInput,
} from "../../../src/api/contracts/library.js";
import { getDb } from "../../../src/db/index.js";
import * as Pandora from "../../../src/sources/pandora/client.js";
import type { SourceType } from "../../../src/sources/types.js";
import { parseId, trackCapabilities } from "../../lib/ids.js";
import { publicHandler } from "../handler.js";
import type { AuthSessionShape } from "../services/authSession.js";
import type { LibraryShape } from "../services/library.js";
import type { SourceCatalogShape } from "../services/sourceCatalog.js";

export type LibraryHandlerDeps = {
  readonly auth: AuthSessionShape;
  readonly library: LibraryShape;
  readonly catalog: SourceCatalogShape;
};

export const libraryHandlers = (deps: LibraryHandlerDeps) => ({
  "library.albums.list": (payload: ApiListLibraryAlbumsInput) =>
    publicHandler(
      deps.library.list({
        ...(payload.placements !== undefined
          ? { placements: payload.placements }
          : {}),
        ...(payload.includeArchive !== undefined
          ? { includeArchive: payload.includeArchive }
          : {}),
        ...(payload.includeDismissed !== undefined
          ? { includeDismissed: payload.includeDismissed }
          : {}),
        ...(payload.hotOnly !== undefined ? { hotOnly: payload.hotOnly } : {}),
      }),
    ),

  "library.album.get": (payload: ApiLibraryAlbumIdInput) =>
    publicHandler(deps.library.get(payload.id)),

  "library.hotAlbums.list": (payload: ApiHotAlbumsInput) =>
    publicHandler(
      deps.library
        .list({
          hotOnly: true,
          includeArchive: true,
          includeDismissed: payload.includeDismissed ?? true,
        })
        .pipe(Effect.map((rows) => rows.slice(0, payload.limit ?? 20))),
    ),

  "library.albumStates.resolve": (payload: ApiResolveAlbumStatesInput) =>
    publicHandler(deps.library.resolveStates(payload.sourceIds)),

  "library.albumTracks.list": (payload: ApiLibraryAlbumTracksInput) =>
    publicHandler(
      Effect.tryPromise({
        try: async () => {
          const db = await getDb();
          const tracks = await db.albumTracks.query({
            where: { albumId: payload.albumId },
            sort: { trackIndex: "asc" },
          }).runPromise;
          return tracks.map((t) => ({
            id: t.id,
            trackIndex: t.trackIndex,
            title: t.title,
            artist: t.artist,
            ...(t.duration != null ? { duration: t.duration } : {}),
            ...(t.artworkUrl != null ? { artworkUrl: t.artworkUrl } : {}),
            capabilities: trackCapabilities(t.source as SourceType),
          }));
        },
        catch: (cause) => cause,
      }),
    ),

  "library.album.save": (payload: ApiSaveAlbumInput) =>
    publicHandler(
      Effect.gen(function* () {
        const sourceManager = yield* deps.catalog.resolveManager;
        return yield* deps.library.save(payload.id, sourceManager);
      }),
    ),

  "library.albumPlacement.set": (payload: ApiSetAlbumPlacementInput) =>
    publicHandler(
      deps.library.setPlacement(payload.albumId, payload.placement),
    ),

  "library.album.remove": (payload: ApiRemoveLibraryAlbumInput) =>
    publicHandler(
      Effect.tryPromise({
        try: async () => {
          const db = await getDb();
          const tracks = await db.albumTracks.query({
            where: { albumId: payload.id },
          }).runPromise;
          for (const track of tracks) {
            await db.albumTracks.delete(track.id).runPromise;
          }
          const refs = await db.albumSourceRefs.query({
            where: { albumId: payload.id },
          }).runPromise;
          for (const ref of refs) {
            await db.albumSourceRefs.delete(ref.id).runPromise;
          }
          await db.albums.delete(payload.id).runPromise;
          return { success: true as const };
        },
        catch: (cause) => cause,
      }),
    ),

  "library.album.update": (payload: ApiUpdateAlbumInput) =>
    publicHandler(
      Effect.tryPromise({
        try: async () => {
          const db = await getDb();
          const fields: { title?: string; artist?: string } = {};
          if (payload.title !== undefined) fields.title = payload.title;
          if (payload.artist !== undefined) fields.artist = payload.artist;
          await db.albums.update(payload.id, fields).runPromise;
          return { success: true as const };
        },
        catch: (cause) => cause,
      }),
    ),

  "library.track.update": (payload: ApiUpdateLibraryTrackInput) =>
    publicHandler(
      Effect.tryPromise({
        try: async () => {
          const db = await getDb();
          await db.albumTracks.update(payload.id, { title: payload.title })
            .runPromise;
          return { success: true as const };
        },
        catch: (cause) => cause,
      }),
    ),

  "library.bookmarks.list": () =>
    publicHandler(
      deps.auth.withAuthRetry((ctx) =>
        Pandora.getBookmarks(ctx.pandoraSession),
      ),
    ),

  "library.bookmark.add": (payload: ApiAddBookmarkInput) =>
    publicHandler(
      deps.auth.withAuthRetry((ctx) => {
        const parsed = parseId(payload.id);
        const trackToken = parsed.id;
        if (payload.type === "artist") {
          return Pandora.addArtistBookmark(ctx.pandoraSession, { trackToken });
        }
        return Pandora.addSongBookmark(ctx.pandoraSession, { trackToken });
      }),
    ),

  "library.bookmark.remove": (payload: ApiRemoveBookmarkInput) =>
    publicHandler(
      deps.auth
        .withAuthRetry((ctx) => {
          if (payload.type === "artist") {
            return Pandora.deleteArtistBookmark(ctx.pandoraSession, {
              bookmarkToken: payload.bookmarkToken,
            });
          }
          return Pandora.deleteSongBookmark(ctx.pandoraSession, {
            bookmarkToken: payload.bookmarkToken,
          });
        })
        .pipe(Effect.map(() => ({ success: true as const }))),
    ),
});
