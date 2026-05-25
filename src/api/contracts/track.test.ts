import { describe, expect, it } from "bun:test";
import { Schema } from "effect";
import {
	RemoveTrackFeedbackInputSchema,
	TrackExplainResponseSchema,
	TrackFeedbackInputSchema,
	TrackFeedbackResultSchema,
	TrackIdRequestSchema,
	TrackMetadataSchema,
	TrackSleepInputSchema,
	TrackStreamUrlInputSchema,
	TrackStreamUrlResponseSchema,
} from "./track.js";

describe("track API contracts", () => {
	it("accepts known opaque and composite track ids in track.get input", () => {
		expect(
			Schema.decodeUnknownSync(TrackIdRequestSchema)({ id: "ytmusic:track_1" }),
		).toEqual({ id: "ytmusic:track_1" });
		expect(
			Schema.decodeUnknownSync(TrackIdRequestSchema)({ id: "nanoidLike1" }),
		).toEqual({ id: "nanoidLike1" });
		expect(() =>
			Schema.decodeUnknownSync(TrackIdRequestSchema)({ id: "evil:bad" }),
		).toThrow();
	});

	it("decodes track metadata with capabilities", () => {
		expect(
			Schema.decodeUnknownSync(TrackMetadataSchema)({
				id: "ytmusic:track_1",
				capabilities: {
					feedback: false,
					sleep: false,
					bookmark: false,
					explain: false,
					radio: true,
				},
			}),
		).toMatchObject({ id: "ytmusic:track_1" });
	});

	it("requires /stream URLs in the streamUrl response", () => {
		expect(
			Schema.decodeUnknownSync(TrackStreamUrlResponseSchema)({
				url: "/stream/ytmusic:track_1",
			}),
		).toEqual({ url: "/stream/ytmusic:track_1" });
		expect(() =>
			Schema.decodeUnknownSync(TrackStreamUrlResponseSchema)({
				url: "https://upstream.example/audio",
			}),
		).toThrow();
	});

	it("bounds streamUrl input ids", () => {
		expect(
			Schema.decodeUnknownSync(TrackStreamUrlInputSchema)({
				id: "ytmusic:track_1",
				nextId: "ytmusic:track_2",
			}),
		).toMatchObject({ nextId: "ytmusic:track_2" });
		expect(() =>
			Schema.decodeUnknownSync(TrackStreamUrlInputSchema)({ id: "evil:bad" }),
		).toThrow();
	});

	it("requires non-empty radioId and a boolean positive flag in feedback input", () => {
		expect(
			Schema.decodeUnknownSync(TrackFeedbackInputSchema)({
				id: "pandora:track_token",
				radioId: "pandora:station_token",
				positive: true,
			}),
		).toMatchObject({ positive: true });
		expect(() =>
			Schema.decodeUnknownSync(TrackFeedbackInputSchema)({
				id: "pandora:track_token",
				radioId: "",
				positive: true,
			}),
		).toThrow();
	});

	it("decodes feedback result with required upstream fields", () => {
		expect(
			Schema.decodeUnknownSync(TrackFeedbackResultSchema)({
				feedbackId: "pandora:feedback_1",
				songName: "Song",
				artistName: "Artist",
			}),
		).toMatchObject({ feedbackId: "pandora:feedback_1" });
	});

	it("requires non-empty feedback id on remove and id on sleep", () => {
		expect(() =>
			Schema.decodeUnknownSync(RemoveTrackFeedbackInputSchema)({
				feedbackId: "",
			}),
		).toThrow();
		expect(
			Schema.decodeUnknownSync(TrackSleepInputSchema)({
				id: "pandora:track_token",
			}),
		).toMatchObject({ id: "pandora:track_token" });
	});

	it("decodes the explain response with trait list", () => {
		const decoded = Schema.decodeUnknownSync(TrackExplainResponseSchema)({
			explanations: [{ traitId: "tr_1", traitName: "mellow vocals" }],
		});
		expect(decoded.explanations[0]?.traitName).toBe("mellow vocals");
	});
});
