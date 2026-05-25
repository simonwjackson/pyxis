import { describe, expect, it } from "bun:test";
import { Cause } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import type {
	ApiPlaylist,
	ApiPlaylistTrack,
} from "../../../api/contracts/playlist.js";
import { PlaylistDetailState } from "./PlaylistDetailState.js";

const playlist = (id = "ytmusic:playlist-1"): ApiPlaylist => ({
	id,
	name: "Road Mix",
	source: "ytmusic",
	artworkUrl: "https://example.com/art.jpg",
});

const track = (id = "ytmusic:track-1"): ApiPlaylistTrack => ({
	id,
	title: "Track",
	artist: "Artist",
	album: "Album",
	duration: 180,
	artworkUrl: "https://example.com/track.jpg",
	capabilities: {
		feedback: false,
		sleep: false,
		bookmark: false,
		explain: false,
		radio: true,
	},
});

describe("PlaylistDetailState.fromResults", () => {
	it("is Loading while the playlist list is loading", () => {
		expect(
			PlaylistDetailState.fromResults(
				"ytmusic:playlist-1",
				AsyncResult.initial(true),
				AsyncResult.success([track()]),
			),
		).toEqual({ _tag: "Loading" });
	});

	it("is NotFound when the playlist id is absent from the list", () => {
		expect(
			PlaylistDetailState.fromResults(
				"ytmusic:missing",
				AsyncResult.success([playlist()]),
				AsyncResult.success([track()]),
			),
		).toEqual({ _tag: "NotFound" });
	});

	it("is Loading while tracks are loading for a known playlist", () => {
		expect(
			PlaylistDetailState.fromResults(
				"ytmusic:playlist-1",
				AsyncResult.success([playlist()]),
				AsyncResult.initial(true),
			),
		).toEqual({ _tag: "Loading" });
	});

	it("is Ready with playlist metadata and tracks", () => {
		const knownPlaylist = playlist();
		const tracks = [track()];
		expect(
			PlaylistDetailState.fromResults(
				knownPlaylist.id,
				AsyncResult.success([knownPlaylist]),
				AsyncResult.success(tracks),
			),
		).toEqual({ _tag: "Ready", playlist: knownPlaylist, tracks });
	});

	it("is LoadError for typed public errors", () => {
		const error = { _tag: "SourceUnavailable" as const, code: "offline" };
		expect(
			PlaylistDetailState.fromResults(
				"ytmusic:playlist-1",
				AsyncResult.success([playlist()]),
				AsyncResult.failure(Cause.fail(error)),
			),
		).toEqual({ _tag: "LoadError", error });
	});

	it("is Defect for transport defects", () => {
		const defect = new Error("transport");
		const state = PlaylistDetailState.fromResults(
			"ytmusic:playlist-1",
			AsyncResult.failure(Cause.die(defect)),
			AsyncResult.success([track()]),
		);
		expect(state._tag).toBe("Defect");
		if (state._tag === "Defect") expect(state.defect).toBe(defect);
	});
});
