import { describe, expect, it } from "bun:test";
import { Schema } from "effect";
import { LibraryAlbumSchema, SaveAlbumResultSchema } from "./library.js";

describe("library API contracts", () => {
	it("accepts current library album wire shape", () => {
		const album = Schema.decodeUnknownSync(LibraryAlbumSchema)({
			id: "album_1",
			title: "Album",
			artist: "Artist",
			placement: "discovery",
			placementUpdatedAt: 1,
			sourceIds: ["ytmusic:remote_album_1"],
		});

		expect(album.placement).toBe("discovery");
		expect(album.sourceIds).toEqual(["ytmusic:remote_album_1"]);
	});

	it("rejects invalid placements in command results", () => {
		expect(() =>
			Schema.decodeUnknownSync(SaveAlbumResultSchema)({
				id: "album_1",
				outcome: "created",
				placement: "favorites",
			}),
		).toThrow();
	});
});
