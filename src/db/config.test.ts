import { describe, expect, it } from "bun:test";
import { Schema } from "effect";
import { AlbumSchema, dbConfig, TrackSourceSchema, UpgradeQueueSchema } from "./config";

describe("AlbumSchema", () => {
	it("accepts valid placement state", () => {
		const value = {
			id: "album_1",
			title: "Album",
			artist: "Artist",
			placement: "collection",
			placementUpdatedAt: Date.now(),
			createdAt: Date.now(),
		};

		expect(() => Schema.decodeUnknownSync(AlbumSchema)(value)).not.toThrow();
	});

	it("rejects invalid placement state", () => {
		const value = {
			id: "album_1",
			title: "Album",
			artist: "Artist",
			placement: "hot",
			placementUpdatedAt: Date.now(),
			createdAt: Date.now(),
		};

		expect(() => Schema.decodeUnknownSync(AlbumSchema)(value)).toThrow();
	});
});

describe("TrackSourceSchema", () => {
	it("rejects invalid source and reviewStatus values", () => {
		expect(() =>
			Schema.decodeUnknownSync(TrackSourceSchema)({
				id: "ts_invalid",
				trackId: "track_invalid",
				source: "invalid-source",
				sourceTrackId: "source_track_invalid",
				lossless: true,
				reviewStatus: "maybe",
				createdAt: Date.now(),
			}),
		).toThrow();
	});

	it("accepts all required fields", () => {
		const value = {
			id: "ts_1",
			trackId: "track_1",
			source: "soulseek",
			sourceTrackId: "source_track_1",
			lossless: true,
			createdAt: Date.now(),
		};

		expect(() => Schema.decodeUnknownSync(TrackSourceSchema)(value)).not.toThrow();
	});

	it("rejects invalid source", () => {
		const value = {
			id: "ts_1",
			trackId: "track_1",
			source: "invalid_source",
			sourceTrackId: "source_track_1",
			lossless: true,
			createdAt: Date.now(),
		};

		expect(() => Schema.decodeUnknownSync(TrackSourceSchema)(value)).toThrow();
	});

	it("rejects confidence above 1", () => {
		const value = {
			id: "ts_2",
			trackId: "track_2",
			source: "soulseek",
			sourceTrackId: "source_track_2",
			lossless: true,
			confidence: 1.1,
			createdAt: Date.now(),
		};

		expect(() => Schema.decodeUnknownSync(TrackSourceSchema)(value)).toThrow();
	});

	it("rejects invalid reviewStatus", () => {
		const value = {
			id: "ts_3",
			trackId: "track_3",
			source: "soulseek",
			sourceTrackId: "source_track_3",
			lossless: true,
			reviewStatus: "unknown",
			createdAt: Date.now(),
		};

		expect(() => Schema.decodeUnknownSync(TrackSourceSchema)(value)).toThrow();
	});

	it("rejects missing required fields", () => {
		const value = {
			id: "ts_missing",
			source: "soulseek",
			sourceTrackId: "source_track_missing",
			lossless: true,
			createdAt: Date.now(),
		};

		expect(() => Schema.decodeUnknownSync(TrackSourceSchema)(value)).toThrow();
	});
});

describe("UpgradeQueueSchema", () => {
	it("rejects invalid status values", () => {
		expect(() =>
			Schema.decodeUnknownSync(UpgradeQueueSchema)({
				id: "uq_invalid",
				trackId: "track_invalid",
				targetFormat: "flac",
				retryCount: 0,
				nextRetryAt: Date.now(),
				status: "bogus",
				createdAt: Date.now(),
			}),
		).toThrow();
	});

	it("accepts all required fields", () => {
		const value = {
			id: "uq_1",
			trackId: "track_1",
			targetFormat: "flac",
			retryCount: 0,
			nextRetryAt: Date.now(),
			status: "pending",
			createdAt: Date.now(),
		};

		expect(() => Schema.decodeUnknownSync(UpgradeQueueSchema)(value)).not.toThrow();
	});

	it("rejects negative retryCount", () => {
		const value = {
			id: "uq_2",
			trackId: "track_2",
			targetFormat: "flac",
			retryCount: -1,
			nextRetryAt: Date.now(),
			status: "pending",
			createdAt: Date.now(),
		};

		expect(() => Schema.decodeUnknownSync(UpgradeQueueSchema)(value)).toThrow();
	});

	it("rejects malformed retry schedule", () => {
		const value = {
			id: "uq_3",
			trackId: "track_3",
			targetFormat: "flac",
			retryCount: 0,
			nextRetryAt: NaN,
			status: "pending",
			createdAt: Date.now(),
		};

		expect(() => Schema.decodeUnknownSync(UpgradeQueueSchema)(value)).toThrow();
	});

	it("rejects invalid status", () => {
		const value = {
			id: "uq_4",
			trackId: "track_4",
			targetFormat: "flac",
			retryCount: 0,
			nextRetryAt: Date.now(),
			status: "unknown",
			createdAt: Date.now(),
		};

		expect(() => Schema.decodeUnknownSync(UpgradeQueueSchema)(value)).toThrow();
	});

	it("rejects missing required fields", () => {
		const value = {
			id: "uq_missing",
			targetFormat: "flac",
			retryCount: 0,
			nextRetryAt: Date.now(),
			status: "pending",
			createdAt: Date.now(),
		};

		expect(() => Schema.decodeUnknownSync(UpgradeQueueSchema)(value)).toThrow();
	});
});

describe("db indexes", () => {
	it("defines indexes for placement and hot query paths", () => {
		expect(dbConfig.albums.indexes).toEqual(["placement"]);
		expect(dbConfig.albumTracks.indexes).toEqual([
			"albumId",
			["source", "sourceTrackId"],
		]);
		expect(dbConfig.trackSources.indexes).toEqual([
			"trackId",
			["trackId", "reviewStatus"],
			["source", "sourceTrackId"],
		]);
		expect(dbConfig.upgradeQueue.indexes).toEqual([
			"trackId",
			"status",
			"nextRetryAt",
			["status", "nextRetryAt"],
		]);
	});
});

