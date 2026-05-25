/**
 * @module server/rpc/handlers/search
 * Effect RPC handlers for the `search.*` family. Preserves the dual-surface
 * search contract from `server/routers/search.ts`:
 *
 * - `search.pandora` requires a Pandora session and returns raw Pandora
 *   search results.
 * - `search.unified` always runs the cross-source aggregation and folds in
 *   Pandora-specific artist/genre results when a session is available, so
 *   logged-out users still receive cross-source tracks/albums.
 */

import { Effect } from "effect";
import type {
	ApiPandoraSearchInput,
	ApiSearchInput,
} from "../../../src/api/contracts/search.js";
import * as Pandora from "../../../src/sources/pandora/client.js";
import type {
	SearchArtist,
	SearchGenreStation,
} from "../../../src/sources/pandora/types/api.js";
import type {
	CanonicalAlbum,
	CanonicalTrack,
} from "../../../src/sources/types.js";
import { formatSourceId, trackCapabilities } from "../../lib/ids.js";
import { publicHandler } from "../handler.js";
import type { AuthSessionShape } from "../services/authSession.js";
import type { SourceCatalogShape } from "../services/sourceCatalog.js";
import { mapUnknownError } from "../sourceErrorMap.js";

export type SearchHandlerDeps = {
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

function encodeAlbum(album: CanonicalAlbum) {
	const primarySource = album.sourceIds[0];
	return {
		id: primarySource
			? formatSourceId(primarySource.source, primarySource.id)
			: album.id,
		title: album.title,
		artist: album.artist,
		...(album.year != null ? { year: album.year } : {}),
		...(album.artworkUrl != null ? { artworkUrl: album.artworkUrl } : {}),
		sourceIds: album.sourceIds.map((sid) => formatSourceId(sid.source, sid.id)),
		...(album.genres != null && album.genres.length > 0
			? { genres: album.genres }
			: {}),
		...(album.releaseType != null ? { releaseType: album.releaseType } : {}),
	};
}

export const searchHandlers = (deps: SearchHandlerDeps) => ({
	"search.pandora": (payload: ApiPandoraSearchInput) =>
		publicHandler(
			deps.auth.withAuthRetry((ctx) =>
				Pandora.search(ctx.pandoraSession, payload.searchText),
			),
		),

	"search.unified": (payload: ApiSearchInput) =>
		publicHandler(
			Effect.gen(function* () {
				const manager = yield* deps.catalog.resolveManager;
				const results = yield* deps.catalog.searchAll(manager, payload.query);

				let pandoraArtists: readonly SearchArtist[] = [];
				let pandoraGenres: readonly SearchGenreStation[] = [];
				const session = yield* deps.auth.getSession;
				if (session) {
					const pandoraResults = yield* Pandora.search(
						session,
						payload.query,
					).pipe(Effect.mapError(mapUnknownError));
					pandoraArtists = pandoraResults.artists ?? [];
					pandoraGenres = pandoraResults.genreStations ?? [];
				}

				return {
					tracks: results.tracks.map(encodeTrack),
					albums: results.albums.map(encodeAlbum),
					pandoraArtists,
					pandoraGenres,
				};
			}),
		),
});
