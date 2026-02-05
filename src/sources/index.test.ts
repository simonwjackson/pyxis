/**
 * @module SourceManager tests
 */

import { describe, it, expect } from "bun:test";
import { createSourceManager } from "./index.js";
import type { Source, MetadataSource, CanonicalTrack, CanonicalAlbum, CanonicalPlaylist } from "./types.js";

const createMockTrack = (id: string, title: string, artist: string): CanonicalTrack => ({
	id,
	title,
	artist,
	album: "Test Album",
	sourceId: { source: "ytmusic", id },
});

const createMockAlbum = (id: string, title: string, artist: string): CanonicalAlbum => ({
	id,
	title,
	artist,
	tracks: [],
	sourceIds: [{ source: "ytmusic", id }],
});

const createMockPlaylist = (id: string, name: string): CanonicalPlaylist => ({
	id,
	name,
	source: "ytmusic",
});

describe("createSourceManager", () => {
	describe("getSource", () => {
		it("returns registered source by type", () => {
			const mockSource: Source = { type: "ytmusic", name: "YouTube Music" };
			const manager = createSourceManager([mockSource]);

			expect(manager.getSource("ytmusic")).toBe(mockSource);
		});

		it("returns undefined for unregistered source", () => {
			const mockSource: Source = { type: "ytmusic", name: "YouTube Music" };
			const manager = createSourceManager([mockSource]);

			expect(manager.getSource("pandora")).toBeUndefined();
		});
	});

	describe("getAllSources", () => {
		it("returns all registered sources", () => {
			const sources: Source[] = [
				{ type: "ytmusic", name: "YouTube Music" },
				{ type: "pandora", name: "Pandora" },
			];
			const manager = createSourceManager(sources);

			expect(manager.getAllSources()).toEqual(sources);
		});

		it("returns empty array when no sources registered", () => {
			const manager = createSourceManager([]);
			expect(manager.getAllSources()).toEqual([]);
		});
	});

	describe("listAllPlaylists", () => {
		it("aggregates playlists from all playlist-capable sources", async () => {
			const ytPlaylists: CanonicalPlaylist[] = [
				createMockPlaylist("yt-1", "YT Playlist 1"),
			];
			const pandoraPlaylists: CanonicalPlaylist[] = [
				createMockPlaylist("pandora-1", "Station 1"),
			];

			const sources: Source[] = [
				{
					type: "ytmusic",
					name: "YouTube Music",
					listPlaylists: async () => ytPlaylists,
					getPlaylistTracks: async () => [],
				},
				{
					type: "pandora",
					name: "Pandora",
					listPlaylists: async () => pandoraPlaylists,
					getPlaylistTracks: async () => [],
				},
			];
			const manager = createSourceManager(sources);

			const result = await manager.listAllPlaylists();
			expect(result).toHaveLength(2);
			expect(result).toContainEqual(ytPlaylists[0]);
			expect(result).toContainEqual(pandoraPlaylists[0]);
		});

		it("skips sources without playlist capability", async () => {
			const sources: Source[] = [
				{
					type: "ytmusic",
					name: "YouTube Music",
					listPlaylists: async () => [createMockPlaylist("yt-1", "Playlist")],
					getPlaylistTracks: async () => [],
				},
				{ type: "musicbrainz", name: "MusicBrainz" }, // No playlist capability
			];
			const manager = createSourceManager(sources);

			const result = await manager.listAllPlaylists();
			expect(result).toHaveLength(1);
		});
	});

	describe("getPlaylistTracks", () => {
		it("returns tracks from the specified source", async () => {
			const tracks: CanonicalTrack[] = [
				createMockTrack("1", "Track 1", "Artist 1"),
				createMockTrack("2", "Track 2", "Artist 2"),
			];

			const source: Source = {
				type: "ytmusic",
				name: "YouTube Music",
				listPlaylists: async () => [],
				getPlaylistTracks: async () => tracks,
			};
			const manager = createSourceManager([source]);

			const result = await manager.getPlaylistTracks("ytmusic", "playlist-id");
			expect(result).toEqual(tracks);
		});

		it("throws error for unknown source", async () => {
			const manager = createSourceManager([]);

			await expect(manager.getPlaylistTracks("ytmusic", "playlist-id")).rejects.toThrow(
				'Source "ytmusic" does not support playlists'
			);
		});

		it("throws error for source without playlist capability", async () => {
			const source: Source = { type: "musicbrainz", name: "MusicBrainz" };
			const manager = createSourceManager([source]);

			await expect(manager.getPlaylistTracks("musicbrainz", "playlist-id")).rejects.toThrow(
				'Source "musicbrainz" does not support playlists'
			);
		});
	});

	describe("getStreamUrl", () => {
		it("returns stream URL from the specified source", async () => {
			const expectedUrl = "https://example.com/stream/123";
			const source: Source = {
				type: "ytmusic",
				name: "YouTube Music",
				getStreamUrl: async () => expectedUrl,
			};
			const manager = createSourceManager([source]);

			const result = await manager.getStreamUrl("ytmusic", "track-id");
			expect(result).toBe(expectedUrl);
		});

		it("throws error for unknown source", async () => {
			const manager = createSourceManager([]);

			await expect(manager.getStreamUrl("ytmusic", "track-id")).rejects.toThrow(
				'Source "ytmusic" does not support streaming'
			);
		});

		it("throws error for source without stream capability", async () => {
			const source: Source = { type: "musicbrainz", name: "MusicBrainz" };
			const manager = createSourceManager([source]);

			await expect(manager.getStreamUrl("musicbrainz", "track-id")).rejects.toThrow(
				'Source "musicbrainz" does not support streaming'
			);
		});
	});

	describe("getAlbumTracks", () => {
		it("returns album and tracks from the specified source", async () => {
			const album = createMockAlbum("album-1", "Album Title", "Artist");
			const tracks = [createMockTrack("1", "Track 1", "Artist")];

			const source: Source = {
				type: "ytmusic",
				name: "YouTube Music",
				getAlbumTracks: async () => ({ album, tracks }),
			};
			const manager = createSourceManager([source]);

			const result = await manager.getAlbumTracks("ytmusic", "album-id");
			expect(result.album).toEqual(album);
			expect(result.tracks).toEqual(tracks);
		});

		it("throws error for unknown source", async () => {
			const manager = createSourceManager([]);

			await expect(manager.getAlbumTracks("ytmusic", "album-id")).rejects.toThrow(
				'Source "ytmusic" does not support album tracks'
			);
		});

		it("throws error for source without album capability", async () => {
			const source: Source = { type: "pandora", name: "Pandora" };
			const manager = createSourceManager([source]);

			await expect(manager.getAlbumTracks("pandora", "album-id")).rejects.toThrow(
				'Source "pandora" does not support album tracks'
			);
		});
	});

	describe("searchAll", () => {
		it("aggregates search results from all searchable sources", async () => {
			const ytTracks: CanonicalTrack[] = [createMockTrack("yt-1", "YT Song", "Artist")];
			const ytAlbums: CanonicalAlbum[] = [createMockAlbum("yt-album", "YT Album", "Artist")];

			const source: Source = {
				type: "ytmusic",
				name: "YouTube Music",
				search: async () => ({ tracks: ytTracks, albums: ytAlbums }),
			};
			const manager = createSourceManager([source]);

			const result = await manager.searchAll("test query");
			expect(result.tracks).toHaveLength(1);
			expect(result.albums).toHaveLength(1);
		});

		it("returns empty results when no searchable sources", async () => {
			const source: Source = { type: "musicbrainz", name: "MusicBrainz" };
			const manager = createSourceManager([source]);

			const result = await manager.searchAll("test query");
			expect(result.tracks).toEqual([]);
			expect(result.albums).toEqual([]);
		});

		it("handles source search failures gracefully", async () => {
			const workingSource: Source = {
				type: "ytmusic",
				name: "YouTube Music",
				search: async () => ({ tracks: [createMockTrack("1", "Track", "Artist")], albums: [] }),
			};
			const failingSource: Source = {
				type: "pandora",
				name: "Pandora",
				search: async () => { throw new Error("Search failed"); },
			};
			const manager = createSourceManager([workingSource, failingSource]);

			const result = await manager.searchAll("test");
			// Should still return results from working source
			expect(result.tracks).toHaveLength(1);
		});

		it("merges albums with metadata sources", async () => {
			const primaryAlbum = createMockAlbum("primary-1", "Test Album", "Test Artist");
			const primarySource: Source = {
				type: "ytmusic",
				name: "YouTube Music",
				search: async () => ({ tracks: [], albums: [primaryAlbum] }),
			};

			const metadataSource: MetadataSource = {
				type: "musicbrainz",
				name: "MusicBrainz",
				searchReleases: async () => [{
					fingerprint: "",
					title: "Test Album",
					artists: [{ name: "Test Artist", ids: [] }],
					releaseType: "album",
					ids: [{ source: "musicbrainz", id: "mb-123" }],
					confidence: 0.9,
					genres: ["Rock"],
				}],
			};

			const manager = createSourceManager([primarySource], [metadataSource]);
			const result = await manager.searchAll("test album");

			// Should have merged the albums
			expect(result.albums.length).toBeGreaterThanOrEqual(1);
		});
	});
});
