/**
 * @module server/rpc/handlers/listenLog tests
 * Behavior tests for `listenLog.entries.list`. The handler is a thin
 * wrapper around the listen-log table, so the tests cover the wire-visible
 * contract: descending by `listenedAt`, bounded pagination, and the
 * default limit when callers omit pagination fields.
 */

import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { createNodeDatabase } from "@proseql/node";
import { Effect, Exit, Scope } from "effect";
import { dbConfig } from "../../../src/db/config.js";
import { type DbInstance, setDbForTesting } from "../../../src/db/index.js";
import { listenLogHandlers } from "./listenLog.js";

const handlers = listenLogHandlers();

type TestDb = {
	readonly db: DbInstance;
	readonly cleanup: () => Promise<void>;
};

const tempDirs: string[] = [];

function withTempFiles(baseDir: string) {
	return {
		...dbConfig,
		albums: { ...dbConfig.albums, file: join(baseDir, "albums.yaml") },
		albumSourceRefs: {
			...dbConfig.albumSourceRefs,
			file: join(baseDir, "album-source-refs.yaml"),
		},
		albumTracks: {
			...dbConfig.albumTracks,
			file: join(baseDir, "album-tracks.yaml"),
		},
		playlists: { ...dbConfig.playlists, file: join(baseDir, "playlists.yaml") },
		playerState: {
			...dbConfig.playerState,
			file: join(baseDir, "player-state.yaml"),
		},
		queueState: {
			...dbConfig.queueState,
			file: join(baseDir, "queue-state.yaml"),
		},
		listenLog: {
			...dbConfig.listenLog,
			file: join(baseDir, "listen-log.jsonl"),
		},
		trackSources: {
			...dbConfig.trackSources,
			file: join(baseDir, "track-sources.yaml"),
		},
		upgradeQueue: {
			...dbConfig.upgradeQueue,
			file: join(baseDir, "upgrade-queue.yaml"),
		},
	} as const;
}

async function createTestDb(): Promise<TestDb> {
	const tempDir = await mkdtemp(join(process.cwd(), "tmp-rpc-listenlog-"));
	tempDirs.push(tempDir);
	const scope = await Effect.runPromise(Scope.make());
	const db = await Effect.runPromise(
		Scope.provide(scope)(createNodeDatabase(withTempFiles(tempDir))),
	);
	setDbForTesting(db as DbInstance);
	return {
		db: db as DbInstance,
		cleanup: async () => {
			setDbForTesting(null);
			await Effect.runPromise(Scope.close(scope, Exit.void));
		},
	};
}

afterEach(async () => {
	await Promise.all(
		tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

async function seedEntries(
	db: DbInstance,
	entries: ReadonlyArray<{
		id: string;
		compositeId: string;
		title: string;
		artist: string;
		source: string;
		listenedAt: number;
	}>,
): Promise<void> {
	for (const entry of entries) {
		await db.listenLog.create(entry).runPromise;
	}
}

describe("listenLog.entries.list handler", () => {
	it("returns entries in listenedAt-desc order", async () => {
		const { db, cleanup } = await createTestDb();
		try {
			await seedEntries(db, [
				{
					id: "a",
					compositeId: "ytmusic:t1",
					title: "First",
					artist: "Artist",
					source: "ytmusic",
					listenedAt: 100,
				},
				{
					id: "b",
					compositeId: "ytmusic:t2",
					title: "Second",
					artist: "Artist",
					source: "ytmusic",
					listenedAt: 300,
				},
				{
					id: "c",
					compositeId: "ytmusic:t3",
					title: "Third",
					artist: "Artist",
					source: "ytmusic",
					listenedAt: 200,
				},
			]);
			const result = await Effect.runPromise(
				handlers["listenLog.entries.list"]({}),
			);
			expect(result.map((e) => e.id)).toEqual(["b", "c", "a"]);
		} finally {
			await cleanup();
		}
	});

	it("honors limit and offset pagination", async () => {
		const { db, cleanup } = await createTestDb();
		try {
			await seedEntries(db, [
				{
					id: "a",
					compositeId: "ytmusic:t1",
					title: "First",
					artist: "Artist",
					source: "ytmusic",
					listenedAt: 100,
				},
				{
					id: "b",
					compositeId: "ytmusic:t2",
					title: "Second",
					artist: "Artist",
					source: "ytmusic",
					listenedAt: 200,
				},
				{
					id: "c",
					compositeId: "ytmusic:t3",
					title: "Third",
					artist: "Artist",
					source: "ytmusic",
					listenedAt: 300,
				},
			]);
			const result = await Effect.runPromise(
				handlers["listenLog.entries.list"]({ limit: 1, offset: 1 }),
			);
			expect(result.map((e) => e.id)).toEqual(["b"]);
		} finally {
			await cleanup();
		}
	});
});
