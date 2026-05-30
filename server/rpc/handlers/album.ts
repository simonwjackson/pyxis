/**
 * @module server/rpc/handlers/album
 * Effect RPC handlers for the `album.*` family. Preserves the deep
 * `getAlbumTracks` workflow from `server/routers/album.ts`:
 *
 * - `album.get` and `album.tracks.list` reuse `SourceManager.getAlbumTracks`
 *   so the per-source upstream call remains a single round trip.
 * - `album.withTracks.get` keeps the batched album-with-tracks shape that
 *   `docs/solutions/feature-patterns/2026-02-10-album-browsing-without-save.md`
 *   requires; splitting it would duplicate the upstream work.
 */

import { Effect } from "effect";
import type { ApiSourceAlbumIdInput } from "../../../src/api/contracts/album.js";
import type {
  CanonicalAlbum,
  CanonicalTrack,
} from "../../../src/sources/types.js";
import { formatSourceId, parseId, trackCapabilities } from "../../lib/ids.js";
import { ValidationError } from "../errors.js";
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
  "album.get": (payload: ApiSourceAlbumIdInput) =>
    publicHandler(
      Effect.gen(function* () {
        const parsed = parseId(payload.id);
        if (!parsed.source) {
          return yield* Effect.fail(
            new ValidationError({
              code: "album_id_requires_source_prefix",
              field: "id",
            }),
          );
        }
        const manager = yield* deps.catalog.resolveManager;
        const { album } = yield* deps.catalog.getAlbumTracks(
          manager,
          parsed.source,
          parsed.id,
        );
        return encodeAlbumHeader({ id: payload.id, album });
      }),
    ),

  "album.tracks.list": (payload: ApiSourceAlbumIdInput) =>
    publicHandler(
      Effect.gen(function* () {
        const parsed = parseId(payload.id);
        if (!parsed.source) {
          return yield* Effect.fail(
            new ValidationError({
              code: "album_id_requires_source_prefix",
              field: "id",
            }),
          );
        }
        const manager = yield* deps.catalog.resolveManager;
        const { tracks } = yield* deps.catalog.getAlbumTracks(
          manager,
          parsed.source,
          parsed.id,
        );
        return tracks.map(encodeAlbumTrack);
      }),
    ),

  "album.withTracks.get": (payload: ApiSourceAlbumIdInput) =>
    publicHandler(
      Effect.gen(function* () {
        const parsed = parseId(payload.id);
        if (!parsed.source) {
          return yield* Effect.fail(
            new ValidationError({
              code: "album_id_requires_source_prefix",
              field: "id",
            }),
          );
        }
        const manager = yield* deps.catalog.resolveManager;
        const { album, tracks } = yield* deps.catalog.getAlbumTracks(
          manager,
          parsed.source,
          parsed.id,
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
