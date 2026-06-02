/**
 * @module server/rpc/handlers/album
 * Effect RPC handlers for the `album.*` family. Preserves the deep
 * `getAlbumTracks` workflow from `server/routers/album.ts`:
 *
 * - `album.get` and `album.tracks.list` pass source-prefixed album ids to
 *   SourceCatalog so manager resolution, source validation, capability checks,
 *   and upstream error mapping stay behind the source seam.
 * - `album.withTracks.get` keeps the batched album-with-tracks shape that
 *   `docs/solutions/feature-patterns/2026-02-10-album-browsing-without-save.md`
 *   requires; splitting it would duplicate the upstream work.
 */

import type { ApiSourceAlbumIdInput } from "@shared/api/contracts/album.js";
import type { CanonicalAlbum, CanonicalTrack } from "@shared/sources/types.js";
import { Effect } from "effect";
import { formatSourceId, trackCapabilities } from "../../lib/ids.js";
import { publicHandler } from "../handler.js";
import type { SourceCatalogShape } from "../services/sourceCatalog.js";

export type AlbumHandlerDeps = {
  readonly catalog: SourceCatalogShape;
};

function encodeAlbumHeader(input: { id: string; album: CanonicalAlbum }) {
  const { id, album } = input;
  return {
    id,
    title: album.title,
    artist: album.artist,
    ...(album.year != null ? { year: album.year } : {}),
    ...(album.artworkUrl != null ? { artworkUrl: album.artworkUrl } : {}),
  };
}

function encodeAlbumTrack(track: CanonicalTrack) {
  const opaqueId = formatSourceId(track.sourceId.source, track.sourceId.id);
  return {
    id: opaqueId,
    title: track.title,
    artist: track.artist,
    album: track.album,
    ...(track.duration != null ? { duration: track.duration } : {}),
    ...(track.artworkUrl != null ? { artworkUrl: track.artworkUrl } : {}),
  };
}

export const albumHandlers = (deps: AlbumHandlerDeps) => ({
  "album.metadata.get": (payload: ApiSourceAlbumIdInput) =>
    publicHandler(
      Effect.gen(function* () {
        const { album } = yield* deps.catalog.getAlbumTracks(payload.id);
        return encodeAlbumHeader({ id: payload.id, album });
      }),
    ),

  "album.tracks.list": (payload: ApiSourceAlbumIdInput) =>
    publicHandler(
      Effect.gen(function* () {
        const { tracks } = yield* deps.catalog.getAlbumTracks(payload.id);
        return tracks.map(encodeAlbumTrack);
      }),
    ),

  "album.withTracks.get": (payload: ApiSourceAlbumIdInput) =>
    publicHandler(
      Effect.gen(function* () {
        const { album, tracks } = yield* deps.catalog.getAlbumTracks(
          payload.id,
        );
        return {
          album: encodeAlbumHeader({ id: payload.id, album }),
          tracks: tracks.map((t, index) => ({
            ...encodeAlbumTrack(t),
            trackIndex: index,
            capabilities: trackCapabilities(t.sourceId.source),
          })),
        };
      }),
    ),
});
