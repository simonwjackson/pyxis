import { afterEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { Database } from "@proseql/core";
import { Schema } from "effect";
import { dbConfig, TrackSourceSchema, UpgradeQueueSchema } from "./config";

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
	it("defines composite indexes for expected hot query paths", () => {
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

describe("db collections CRUD", () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
	});

	it("supports CRUD smoke path for trackSources", async () => {
		const tempDir = await mkdtemp(join(process.cwd(), "tmp-db-track-sources-"));
		tempDirs.push(tempDir);
		const db = new Database(dbConfig, { baseDir: tempDir });

		const id = randomUUID();
		await db.trackSources
			.create({
				id,
				trackId: "track_123",
				source: "soulseek",
				sourceTrackId: "slsk_123",
				bitrate: 320,
				format: "mp3",
				lossless: false,
				localPath: "/tmp/track.mp3",
				confidence: 0.96,
				reviewStatus: "auto_approved",
				slskUsername: "peer-user",
				slskFilename: "Music/Artist/Album/01 - Track.mp3",
				createdAt: Date.now(),
			})
			.runPromise;

		const created = await db.trackSources.find(id).runPromise;
		expect(created?.source).toBe("soulseek");
		expect(created?.bitrate).toBe(320);

		await db.trackSources.update(id, { bitrate: 944, format: "flac", lossless: true }).runPromise;

		const updated = await db.trackSources.find(id).runPromise;
		expect(updated?.bitrate).toBe(944);
		expect(updated?.format).toBe("flac");
		expect(updated?.lossless).toBe(true);

		await db.trackSources.delete(id).runPromise;
		const deleted = await db.trackSources.find(id).runPromise;
		expect(deleted).toBeNull();
	});
});
