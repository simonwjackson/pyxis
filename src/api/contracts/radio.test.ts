import { describe, expect, it } from "bun:test";
import { Schema } from "effect";
import {
	AddRadioSeedInputSchema,
	CreateStationInputSchema,
	GenreCategorySchema,
	GetRadioTracksInputSchema,
	QuickMixInputSchema,
	RadioTrackSchema,
	RemoveRadioSeedInputSchema,
	RenameStationInputSchema,
	StationDetailSchema,
	StationSummarySchema,
} from "./radio.js";

describe("radio API contracts", () => {
	it("preserves the current station summary fields", () => {
		const decoded = Schema.decodeUnknownSync(StationSummarySchema)({
			id: "pandora:station_token",
			stationId: "pandora:station_id",
			name: "Station",
			isQuickMix: false,
			quickMixStationIds: ["pandora:other"],
			allowDelete: true,
			allowRename: false,
		});
		expect(decoded.quickMixStationIds).toEqual(["pandora:other"]);
		expect(decoded.allowRename).toBe(false);
	});

	it("decodes the station detail surface with optional music and feedback blocks", () => {
		const decoded = Schema.decodeUnknownSync(StationDetailSchema)({
			id: "pandora:station_token",
			name: "Station",
			stationId: "pandora:station_id",
			music: {
				artists: [
					{
						seedId: "pandora:seed_1",
						artistName: "Artist",
						musicToken: "pandora:music_token",
					},
				],
				songs: [],
			},
			feedback: {
				thumbsUp: [
					{
						feedbackId: "pandora:feedback_1",
						songName: "Song",
						artistName: "Artist",
						isPositive: true,
						dateCreated: { time: 1700000000 },
					},
				],
				thumbsDown: [],
			},
		});
		expect(decoded.music?.artists[0]?.artistName).toBe("Artist");
		expect(decoded.feedback?.thumbsUp[0]?.isPositive).toBe(true);
	});

	it("decodes radio tracks with null artworkUrl preserved", () => {
		const decoded = Schema.decodeUnknownSync(RadioTrackSchema)({
			id: "pandora:track_1",
			title: "Track",
			artist: "Artist",
			album: "Album",
			artworkUrl: null,
			capabilities: {
				feedback: true,
				sleep: true,
				bookmark: true,
				explain: true,
				radio: true,
			},
		});
		expect(decoded.artworkUrl).toBeNull();
		expect(decoded.capabilities.feedback).toBe(true);
	});

	it("accepts radio.getTracks input with bounded quality literal", () => {
		expect(
			Schema.decodeUnknownSync(GetRadioTracksInputSchema)({
				id: "pandora:station_token",
				quality: "high",
			}),
		).toEqual({ id: "pandora:station_token", quality: "high" });
		expect(() =>
			Schema.decodeUnknownSync(GetRadioTracksInputSchema)({
				id: "pandora:station_token",
				quality: "ultra",
			}),
		).toThrow();
	});

	it("requires at least one seed/token in radio.create", () => {
		expect(
			Schema.decodeUnknownSync(CreateStationInputSchema)({
				musicToken: "tok",
			}),
		).toMatchObject({ musicToken: "tok" });
		expect(
			Schema.decodeUnknownSync(CreateStationInputSchema)({
				trackToken: "tok",
				musicType: "song",
			}),
		).toMatchObject({ musicType: "song" });
		expect(() =>
			Schema.decodeUnknownSync(CreateStationInputSchema)({}),
		).toThrow();
		expect(() =>
			Schema.decodeUnknownSync(CreateStationInputSchema)({
				musicType: "playlist",
			}),
		).toThrow();
	});

	it("bounds rename station name length", () => {
		expect(
			Schema.decodeUnknownSync(RenameStationInputSchema)({
				id: "pandora:station_token",
				name: "Renamed",
			}),
		).toMatchObject({ name: "Renamed" });
		expect(() =>
			Schema.decodeUnknownSync(RenameStationInputSchema)({
				id: "pandora:station_token",
				name: "",
			}),
		).toThrow();
		expect(() =>
			Schema.decodeUnknownSync(RenameStationInputSchema)({
				id: "pandora:station_token",
				name: "x".repeat(129),
			}),
		).toThrow();
	});

	it("accepts quick mix configurations and rejects empty ids", () => {
		expect(
			Schema.decodeUnknownSync(QuickMixInputSchema)({ radioIds: ["a", "b"] }),
		).toEqual({ radioIds: ["a", "b"] });
		expect(() =>
			Schema.decodeUnknownSync(QuickMixInputSchema)({ radioIds: [""] }),
		).toThrow();
	});

	it("requires non-empty ids for seed add/remove", () => {
		expect(
			Schema.decodeUnknownSync(AddRadioSeedInputSchema)({
				radioId: "pandora:station_token",
				musicToken: "music_token",
			}),
		).toMatchObject({ musicToken: "music_token" });
		expect(() =>
			Schema.decodeUnknownSync(AddRadioSeedInputSchema)({
				radioId: "",
				musicToken: "music_token",
			}),
		).toThrow();
		expect(() =>
			Schema.decodeUnknownSync(RemoveRadioSeedInputSchema)({
				radioId: "pandora:station_token",
				seedId: "",
			}),
		).toThrow();
	});

	it("decodes the genre category list", () => {
		const decoded = Schema.decodeUnknownSync(GenreCategorySchema)({
			categoryName: "Rock",
			stations: [{ stationToken: "tok", stationName: "Classic Rock" }],
		});
		expect(decoded.stations[0]?.stationName).toBe("Classic Rock");
	});
});
