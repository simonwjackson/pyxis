/**
 * @module server/rpc/handlers/playlist tests
 * Behavior tests for the `playlist.*` handlers. Focused on the parts of
 * `server/routers/playlist.ts` that have meaningful semantics beyond
 * encoding:
 *
 * - `playlist.list` aggregates encoded playlists from the catalog,
 * - `playlist.tracks.list` requires a source-prefixed id and forwards the
 *   raw id to the catalog,
 * - `playlist.radio.create` is exercised through the live router/library
 *   covers; here we only assert the contract-side validation behavior so
 *   no DB side effects are required for this branch-internal test.
 */

import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import type {
	CanonicalPlaylist,
	CanonicalTrack,
	SourceType,
} from "../../../src/sources/types.js";
import type { AuthSessionShape } from "../services/authSession.js";
import type { SourceCatalogShape } from "../services/sourceCatalog.js";
import { playlistHandlers } from "./playlist.js";

const samplePlaylists: readonly CanonicalPlaylist[] = [
	{ source: "ytmusic", id: "pl1", name: "First", description: "intro" },
	{ source: "pandora", id: "pl2", name: "Second" },
];

const sampleTracks: readonly CanonicalTrack[] = [
	{
		sourceId: { source: "ytmusic", id: "t1" },
		title: "Track 1",
		artist: "A",
		album: "Al",
	},
];

function makeCatalog(args: {
	readonly trackCalls: Array<{ source: SourceType; id: string }>;
}): SourceCatalogShape {
	return {
		listPlaylists: () => Effect.succeed(samplePlaylists),
		getPlaylistTracks: (_manager, source, id) => {
			args.trackCalls.push({ source, id });
			return Effect.succeed(sampleTracks);
		},
		searchAll: () => Effect.succeed({ tracks: [], albums: [] } as never),
		getAlbumTracks: () => Effect.fail({} as never),
		getStreamUrl: () => Effect.succeed("/stream/none"),
		resolveManager: Effect.succeed({} as never),
	};
}

const auth: AuthSessionShape = {
	getSession: Effect.succeed(undefined as never),
	requireSession: Effect.fail({} as never),
	getSourceManager: Effect.succeed({} as never),
	refresh: Effect.fail({} as never),
	withAuthRetry: () => Effect.fail({} as never),
};

describe("playlist handlers", () => {
	it("playlist.list encodes every aggregated playlist with capabilities", async () => {
		const handlers = playlistHandlers({
			auth,
			catalog: makeCatalog({ trackCalls: [] }),
		});
		const result = await Effect.runPromise(handlers["playlist.list"]());
		expect(result.map((p) => p.id)).toEqual(["ytmusic:pl1", "pandora:pl2"]);
		expect(result[0]?.capabilities).toEqual({ radio: true });
	});

	it("playlist.tracks.list forwards the raw source id to the catalog", async () => {
		const trackCalls: Array<{ source: SourceType; id: string }> = [];
		const handlers = playlistHandlers({
			auth,
			catalog: makeCatalog({ trackCalls }),
		});
		const tracks = await Effect.runPromise(
			handlers["playlist.tracks.list"]({ id: "ytmusic:pl1" }),
		);
		expect(trackCalls).toEqual([{ source: "ytmusic", id: "pl1" }]);
		expect(tracks.map((t) => t.id)).toEqual(["ytmusic:t1"]);
	});

	it("playlist.tracks.list rejects bare ids with a typed ValidationError", async () => {
		const trackCalls: Array<{ source: SourceType; id: string }> = [];
		const handlers = playlistHandlers({
			auth,
			catalog: makeCatalog({ trackCalls }),
		});
		const exit = await Effect.runPromise(
			Effect.exit(handlers["playlist.tracks.list"]({ id: "bareid" })),
		);
		expect(exit._tag).toBe("Failure");
		expect(trackCalls.length).toBe(0);
	});
});
