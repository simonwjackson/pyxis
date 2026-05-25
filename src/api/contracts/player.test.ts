import { describe, expect, it } from "bun:test";
import { Schema } from "effect";
import {
	JumpToIndexInputSchema,
	PlayContextInputSchema,
	PlayerStateSchema,
	PlayInputSchema,
	ReportAudioErrorInputSchema,
	ReportDurationInputSchema,
	ReportProgressInputSchema,
	SeekInputSchema,
	VolumeInputSchema,
} from "./player.js";

describe("player API contracts", () => {
	it("preserves null current track for stopped playback", () => {
		const state = Schema.decodeUnknownSync(PlayerStateSchema)({
			status: "stopped",
			currentTrack: null,
			progress: 0,
			duration: 0,
			volume: 100,
			updatedAt: 1,
		});

		expect(state.currentTrack).toBeNull();
	});

	it("rejects out-of-range playback state before it reaches clients", () => {
		expect(() =>
			Schema.decodeUnknownSync(PlayerStateSchema)({
				status: "playing",
				currentTrack: null,
				progress: -1,
				duration: 0,
				volume: 101,
				updatedAt: 1,
			}),
		).toThrow();
	});

	it("rejects non-finite progress/duration/volume in player state", () => {
		expect(() =>
			Schema.decodeUnknownSync(PlayerStateSchema)({
				status: "playing",
				currentTrack: null,
				progress: Number.NaN,
				duration: 0,
				volume: 50,
				updatedAt: 1,
			}),
		).toThrow();
		expect(() =>
			Schema.decodeUnknownSync(PlayerStateSchema)({
				status: "playing",
				currentTrack: null,
				progress: 0,
				duration: Number.POSITIVE_INFINITY,
				volume: 50,
				updatedAt: 1,
			}),
		).toThrow();
	});

	it("requires /stream URLs on the embedded current track", () => {
		const ready = Schema.decodeUnknownSync(PlayerStateSchema)({
			status: "playing",
			currentTrack: {
				id: "ytmusic:track_1",
				title: "Track",
				artist: "Artist",
				album: "Album",
				duration: null,
				artworkUrl: null,
				streamUrl: "/stream/ytmusic:track_1",
			},
			progress: 12,
			duration: 180,
			volume: 80,
			updatedAt: 100,
		});
		expect(ready.currentTrack?.streamUrl.startsWith("/stream/")).toBe(true);

		expect(() =>
			Schema.decodeUnknownSync(PlayerStateSchema)({
				status: "playing",
				currentTrack: {
					id: "ytmusic:track_1",
					title: "Track",
					artist: "Artist",
					album: "Album",
					duration: null,
					artworkUrl: null,
					streamUrl: "https://upstream.example/audio",
				},
				progress: 0,
				duration: 0,
				volume: 100,
				updatedAt: 1,
			}),
		).toThrow();
	});

	it("accepts each play context discriminant", () => {
		for (const ctx of [
			{ type: "manual" },
			{ type: "radio", seedId: "pandora:seed_1" },
			{ type: "album", albumId: "ytmusic:album_1" },
			{ type: "playlist", playlistId: "ytmusic:playlist_1" },
		] as const) {
			expect(
				Schema.decodeUnknownSync(PlayContextInputSchema)(ctx),
			).toMatchObject({ type: ctx.type });
		}
		expect(() =>
			Schema.decodeUnknownSync(PlayContextInputSchema)({ type: "manual_bad" }),
		).toThrow();
	});

	it("bounds player input invariants for play/seek/volume/jump", () => {
		expect(
			Schema.decodeUnknownSync(PlayInputSchema)({
				tracks: [
					{
						id: "ytmusic:track_1",
						title: "Track",
						artist: "Artist",
						album: "Album",
						duration: null,
						artworkUrl: null,
					},
				],
				context: { type: "manual" },
				startIndex: 0,
			}),
		).toMatchObject({ startIndex: 0 });

		expect(() =>
			Schema.decodeUnknownSync(PlayInputSchema)({
				tracks: [
					{
						id: "evil:bad",
						title: "Track",
						artist: "Artist",
						album: "Album",
						duration: null,
						artworkUrl: null,
					},
				],
			}),
		).toThrow();

		expect(() =>
			Schema.decodeUnknownSync(SeekInputSchema)({ position: -1 }),
		).toThrow();
		expect(() =>
			Schema.decodeUnknownSync(VolumeInputSchema)({ level: 200 }),
		).toThrow();
		expect(() =>
			Schema.decodeUnknownSync(JumpToIndexInputSchema)({ index: -1 }),
		).toThrow();
		expect(() =>
			Schema.decodeUnknownSync(JumpToIndexInputSchema)({ index: 1.5 }),
		).toThrow();
	});

	it("supports optional command identity on reports", () => {
		expect(
			Schema.decodeUnknownSync(ReportProgressInputSchema)({
				progress: 12,
				appliesToTrackId: "ytmusic:track_1",
				commandId: "cmd_abc",
			}),
		).toMatchObject({ appliesToTrackId: "ytmusic:track_1" });
		expect(
			Schema.decodeUnknownSync(ReportDurationInputSchema)({ duration: 180 }),
		).toMatchObject({ duration: 180 });

		expect(() =>
			Schema.decodeUnknownSync(ReportProgressInputSchema)({
				progress: Number.NaN,
			}),
		).toThrow();
		expect(() =>
			Schema.decodeUnknownSync(ReportProgressInputSchema)({
				progress: 12,
				appliesToTrackId: "evil:bad",
			}),
		).toThrow();
	});

	it("bounds audio-error report messages", () => {
		expect(
			Schema.decodeUnknownSync(ReportAudioErrorInputSchema)({
				message: "failed to decode",
			}),
		).toMatchObject({ message: "failed to decode" });
		expect(() =>
			Schema.decodeUnknownSync(ReportAudioErrorInputSchema)({ message: "" }),
		).toThrow();
		expect(() =>
			Schema.decodeUnknownSync(ReportAudioErrorInputSchema)({
				message: "x".repeat(501),
			}),
		).toThrow();
	});
});
