/**
 * @module server/rpc/handlers/artist
 * Effect RPC handlers for the `artist.*` family. Preserves the limited
 * semantics of `server/routers/artist.ts`: neither Pandora nor YTMusic
 * exposes a dedicated artist API, so `artist.get` returns the encoded id
 * with a placeholder name and `artist.search` derives artists from unified
 * track search results.
 */

import { Effect } from "effect";
import type {
  ApiArtistIdInput,
  ApiArtistSearchInput,
} from "../../../src/api/contracts/artist.js";
import { formatSourceId, parseId } from "../../lib/ids.js";
import { publicHandler } from "../handler.js";
import type { SourceCatalogShape } from "../services/sourceCatalog.js";

export type ArtistHandlerDeps = {
  readonly catalog: SourceCatalogShape;
};

export const artistHandlers = (deps: ArtistHandlerDeps) => ({
  "artist.get": (payload: ApiArtistIdInput) =>
    Effect.sync(() => {
      const parsed = parseId(payload.id);
      return {
        id: payload.id,
        name: "Unknown",
        source: parsed.source ?? "unknown",
      };
    }),

  "artist.search": (payload: ApiArtistSearchInput) =>
    publicHandler(
      Effect.gen(function* () {
        const manager = yield* deps.catalog.resolveManager;
        const results = yield* deps.catalog.searchAll(manager, payload.query);
        const seen = new Set<string>();
        const artists = results.tracks
          .filter((t) => {
            if (seen.has(t.artist)) return false;
            seen.add(t.artist);
            return true;
          })
          .map((t) => ({
            id: formatSourceId(t.sourceId.source, t.sourceId.id),
            name: t.artist,
          }));
        return { artists };
      }),
    ),
});
