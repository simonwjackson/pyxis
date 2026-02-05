/**
 * @module SourceTypes tests
 */

import { describe, it, expect } from "bun:test";
import {
	hasSearchCapability,
	hasPlaylistCapability,
	hasStreamCapability,
	hasAlbumCapability,
	hasMetadataSearchCapability,
	SOURCE_PRIORITY,
	type Source,
	type MetadataSource,
} from "./types.js";

describe("type guards", () => {
	describe("hasSearchCapability", () => {
		it("returns true when source has search function", () => {
			const source: Source = {
				type: "ytmusic",
				name: "YouTube Music",
				search: async () => ({ tracks: [], albums: [] }),
			};
			expect(hasSearchCapability(source)).toBe(true);
		});

		it("returns false when source lacks search function", () => {
			const source: Source = {
				type: "pandora",
				name: "Pandora",
			};
			expect(hasSearchCapability(source)).toBe(false);
		});
	});

	describe("hasPlaylistCapability", () => {
		it("returns true when source has both playlist functions", () => {
			const source: Source = {
				type: "pandora",
				name: "Pandora",
				listPlaylists: async () => [],
				getPlaylistTracks: async () => [],
			};
			expect(hasPlaylistCapability(source)).toBe(true);
		});

		it("returns false when source only has listPlaylists", () => {
			const source: Source = {
				type: "pandora",
				name: "Pandora",
				listPlaylists: async () => [],
			};
			expect(hasPlaylistCapability(source)).toBe(false);
		});

		it("returns false when source only has getPlaylistTracks", () => {
			const source: Source = {
				type: "pandora",
				name: "Pandora",
				getPlaylistTracks: async () => [],
			};
			expect(hasPlaylistCapability(source)).toBe(false);
		});

		it("returns false when source has neither function", () => {
			const source: Source = {
				type: "musicbrainz",
				name: "MusicBrainz",
			};
			expect(hasPlaylistCapability(source)).toBe(false);
		});
	});

	describe("hasStreamCapability", () => {
		it("returns true when source has getStreamUrl function", () => {
			const source: Source = {
				type: "ytmusic",
				name: "YouTube Music",
				getStreamUrl: async () => "https://example.com/stream",
			};
			expect(hasStreamCapability(source)).toBe(true);
		});

		it("returns false when source lacks getStreamUrl function", () => {
			const source: Source = {
				type: "musicbrainz",
				name: "MusicBrainz",
			};
			expect(hasStreamCapability(source)).toBe(false);
		});
	});

	describe("hasAlbumCapability", () => {
		it("returns true when source has getAlbumTracks function", () => {
			const source: Source = {
				type: "ytmusic",
				name: "YouTube Music",
				getAlbumTracks: async () => ({
					album: {
						id: "1",
						title: "Album",
						artist: "Artist",
						tracks: [],
						sourceIds: [],
					},
					tracks: [],
				}),
			};
			expect(hasAlbumCapability(source)).toBe(true);
		});

		it("returns false when source lacks getAlbumTracks function", () => {
			const source: Source = {
				type: "pandora",
				name: "Pandora",
			};
			expect(hasAlbumCapability(source)).toBe(false);
		});
	});

	describe("hasMetadataSearchCapability", () => {
		it("returns true when source has searchReleases function", () => {
			const source: MetadataSource = {
				type: "musicbrainz",
				name: "MusicBrainz",
				searchReleases: async () => [],
			};
			expect(hasMetadataSearchCapability(source)).toBe(true);
		});

		it("returns false when source lacks searchReleases function", () => {
			const source: Source = {
				type: "ytmusic",
				name: "YouTube Music",
				search: async () => ({ tracks: [], albums: [] }),
			};
			expect(hasMetadataSearchCapability(source)).toBe(false);
		});
	});
});

describe("SOURCE_PRIORITY", () => {
	it("ranks ytmusic as highest priority streaming source", () => {
		expect(SOURCE_PRIORITY["ytmusic"]).toBe(1);
	});

	it("ranks metadata-only sources as lowest priority", () => {
		expect(SOURCE_PRIORITY["musicbrainz"]).toBe(99);
		expect(SOURCE_PRIORITY["discogs"]).toBe(99);
		expect(SOURCE_PRIORITY["deezer"]).toBe(99);
		expect(SOURCE_PRIORITY["local"]).toBe(99);
	});

	it("ranks streaming sources by quality", () => {
		expect(SOURCE_PRIORITY["ytmusic"]).toBeLessThan(SOURCE_PRIORITY["soundcloud"]);
		expect(SOURCE_PRIORITY["soundcloud"]).toBeLessThan(SOURCE_PRIORITY["bandcamp"]);
		expect(SOURCE_PRIORITY["bandcamp"]).toBeLessThan(SOURCE_PRIORITY["pandora"]);
	});

	it("includes all source types", () => {
		const sources = ["pandora", "ytmusic", "local", "musicbrainz", "discogs", "deezer", "bandcamp", "soundcloud"] as const;
		for (const source of sources) {
			expect(SOURCE_PRIORITY[source]).toBeDefined();
			expect(typeof SOURCE_PRIORITY[source]).toBe("number");
		}
	});
});
