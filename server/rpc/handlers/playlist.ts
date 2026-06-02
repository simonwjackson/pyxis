/**
 * @module server/rpc/handlers/playlist
 * Effect RPC handlers for the `playlist.*` family. Mirrors
 * `server/routers/playlist.ts`:
 *
 * - `playlist.list` aggregates playlists from every connected source.
 * - `playlist.tracks.list` requires a source-prefixed composite id and
 *   delegates to the source manager.
 * - `playlist.radio.create` creates a YTMusic radio playlist and
 *   invalidates source manager caches so the new playlist appears in
 *   subsequent `playlist.list` calls.
 */

import type {
  ApiCreatePlaylistRadioInput,
  ApiPlaylistTracksInput,
} from "@shared/api/contracts/playlist.js";
import { getDb } from "@shared/db/index.js";
import type {
  CanonicalPlaylist,
  CanonicalTrack,
} from "@shared/sources/types.js";
import { generateRadioUrl } from "@shared/sources/ytmusic/index.js";
import { Effect } from "effect";
import {
  formatSourceId,
  parseId,
  playlistCapabilities,
  trackCapabilities,
} from "../../lib/ids.js";
import { invalidateManagers } from "../../services/sourceManager.js";
import { publicHandler } from "../handler.js";
import type { AuthSessionShape } from "../services/authSession.js";
import type { SourceCatalogShape } from "../services/sourceCatalog.js";

export type PlaylistHandlerDeps = {
  readonly auth: AuthSessionShape;
  readonly catalog: SourceCatalogShape;
};

function encodeTrack(track: CanonicalTrack) {
  return {
    id: formatSourceId(track.sourceId.source, track.sourceId.id),
    title: track.title,
    artist: track.artist,
    album: track.album,
    ...(track.duration != null ? { duration: track.duration } : {}),
    ...(track.artworkUrl != null ? { artworkUrl: track.artworkUrl } : {}),
    capabilities: trackCapabilities(track.sourceId.source),
  };
}

function encodePlaylist(playlist: CanonicalPlaylist) {
  return {
    id: formatSourceId(playlist.source, playlist.id),
    name: playlist.name,
    source: playlist.source,
    capabilities: playlistCapabilities(playlist.source),
    ...(playlist.description != null
      ? { description: playlist.description }
      : {}),
    ...(playlist.artworkUrl != null ? { artworkUrl: playlist.artworkUrl } : {}),
  };
}

export const playlistHandlers = (deps: PlaylistHandlerDeps) => ({
  "library.playlists.list": () =>
    publicHandler(
      Effect.gen(function* () {
        const playlists = yield* deps.catalog.listPlaylists();
        return playlists.map(encodePlaylist);
      }),
    ),

  "playlist.tracks.list": (payload: ApiPlaylistTracksInput) =>
    publicHandler(
      Effect.gen(function* () {
        const tracks = yield* deps.catalog.getPlaylistTracks(payload.id);
        return tracks.map(encodeTrack);
      }),
    ),

  "playlist.radio.create": (payload: ApiCreatePlaylistRadioInput) =>
    publicHandler(
      Effect.tryPromise({
        try: async () => {
          const parsed = parseId(payload.trackId);
          const seedTrackId = parsed.id;
          const db = await getDb();
          const radioUrl = generateRadioUrl(seedTrackId);
          const id = `radio-${seedTrackId}`;
          await db.playlists.upsert({
            where: { id },
            create: {
              id,
              name: payload.name,
              source: "ytmusic",
              url: radioUrl,
              isRadio: true,
              seedTrackId,
              ...(payload.artworkUrl != null
                ? { artworkUrl: payload.artworkUrl }
                : {}),
            },
            update: {},
          }).runPromise;
          invalidateManagers();
          return {
            id: formatSourceId("ytmusic", id),
            url: radioUrl,
          };
        },
        catch: (cause) => cause,
      }),
    ),
});
