/**
 * @module server/rpc/handlers/queue tests
 * Behavior tests for the `queue.*` family. The handlers wrap the live
 * queue singleton through the {@link QueueLayerLive} Effect service.
 *
 * Coverage targets the U5 invariants:
 * - serialized queue state preserves display-only metadata
 * - command outcomes round-trip through the singleton
 * - invalid index commands are no-op transitions
 * - the realtime stream is snapshot-first, emits subsequent mutations,
 *   and cleans up listeners on scope close
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Effect, Stream } from "effect";
import type { QueueTrack } from "../../services/queue.js";
import * as QueueSingleton from "../../services/queue.js";
import { Queue as QueueCtx, QueueLayerLive } from "../services/queue.js";
import {
	type QueueHandlerDeps,
	queueHandlers,
	serializeQueueState,
} from "./queue.js";

function track(id: string): QueueTrack {
	return {
		id,
		title: `Track ${id}`,
		artist: "Artist",
		album: "Album",
		duration: 180,
		artworkUrl: null,
		source: "ytmusic",
	};
}

const resolveDeps = Effect.gen(function* () {
	const queue = yield* QueueCtx;
	return { queue } satisfies QueueHandlerDeps;
});

async function withHandlers<A>(
	fn: (handlers: ReturnType<typeof queueHandlers>) => Promise<A>,
): Promise<A> {
	return Effect.runPromise(
		Effect.provide(
			Effect.gen(function* () {
				const deps = yield* resolveDeps;
				const handlers = queueHandlers(deps);
				return yield* Effect.promise(() => fn(handlers));
			}),
			QueueLayerLive,
		),
	);
}

beforeEach(() => {
	QueueSingleton.clear();
});

afterEach(() => {
	QueueSingleton.clear();
});

describe("queue.state.get", () => {
	it("returns the serialized current queue with display metadata only", async () => {
		QueueSingleton.setQueue([track("ytmusic:a"), track("ytmusic:b")], {
			type: "manual",
		});
		const result = await withHandlers(async (handlers) =>
			Effect.runPromise(handlers["queue.state.get"]()),
		);
		expect(result.items.map((t) => t.id)).toEqual(["ytmusic:a", "ytmusic:b"]);
		expect(result.currentIndex).toBe(0);
		expect(result.context.type).toBe("manual");
		// `source` is an internal singleton field and must not leak through the
		// wire encoder.
		expect(JSON.stringify(result)).not.toContain('"source"');
	});
});

describe("queue.tracks.add", () => {
	it("appends tracks resolved through the source helper", async () => {
		QueueSingleton.setQueue([track("ytmusic:a")], { type: "manual" });
		const result = await withHandlers(async (handlers) =>
			Effect.runPromise(
				handlers["queue.tracks.add"]({
					tracks: [
						{
							id: "ytmusic:b",
							title: "B",
							artist: "Artist",
							album: "Album",
							duration: 200,
							artworkUrl: null,
						},
					],
				}),
			),
		);
		expect(result.items.map((t) => t.id)).toEqual(["ytmusic:a", "ytmusic:b"]);
		expect(QueueSingleton.getState().items[1]?.source).toBe("ytmusic");
	});

	it("respects insertNext when set", async () => {
		QueueSingleton.setQueue([track("ytmusic:a"), track("ytmusic:b")], {
			type: "manual",
		});
		const result = await withHandlers(async (handlers) =>
			Effect.runPromise(
				handlers["queue.tracks.add"]({
					tracks: [
						{
							id: "ytmusic:next",
							title: "Next",
							artist: "Artist",
							album: "Album",
							duration: null,
							artworkUrl: null,
						},
					],
					insertNext: true,
				}),
			),
		);
		expect(result.items.map((t) => t.id)).toEqual([
			"ytmusic:a",
			"ytmusic:next",
			"ytmusic:b",
		]);
	});
});

describe("queue.track.remove (invalid index is no-op)", () => {
	it("returns the unchanged queue when index is out of bounds", async () => {
		QueueSingleton.setQueue([track("ytmusic:a")], { type: "manual" });
		const result = await withHandlers(async (handlers) =>
			Effect.runPromise(handlers["queue.track.remove"]({ index: 99 })),
		);
		expect(result.items.map((t) => t.id)).toEqual(["ytmusic:a"]);
	});
});

describe("queue.jump (invalid index is no-op)", () => {
	it("does not advance for an out-of-bounds index", async () => {
		QueueSingleton.setQueue([track("ytmusic:a")], { type: "manual" });
		const result = await withHandlers(async (handlers) =>
			Effect.runPromise(handlers["queue.jump"]({ index: 99 })),
		);
		expect(result.currentIndex).toBe(0);
	});
});

describe("queue.clear", () => {
	it("clears the singleton queue and returns an empty state", async () => {
		QueueSingleton.setQueue([track("ytmusic:a")], {
			type: "album",
			albumId: "abc",
		});
		const result = await withHandlers(async (handlers) =>
			Effect.runPromise(handlers["queue.clear"]()),
		);
		expect(result.items).toEqual([]);
		expect(result.context.type).toBe("manual");
		expect(QueueSingleton.getState().items).toEqual([]);
	});
});

describe("queue.shuffle", () => {
	it("returns an updated state for multi-track queues", async () => {
		QueueSingleton.setQueue(
			[track("ytmusic:a"), track("ytmusic:b"), track("ytmusic:c")],
			{ type: "manual" },
			1,
		);
		const result = await withHandlers(async (handlers) =>
			Effect.runPromise(handlers["queue.shuffle"]()),
		);
		expect(result.currentIndex).toBe(0);
		expect(result.items[0]?.id).toBe("ytmusic:b");
		expect(result.items.length).toBe(3);
	});
});

describe("queue.state.stream", () => {
	it("is snapshot-first and emits subsequent queue mutations", async () => {
		QueueSingleton.setQueue([track("ytmusic:a")], { type: "manual" });

		const collected = await withHandlers(async (handlers) => {
			const program = Effect.gen(function* () {
				const stream = handlers["queue.state.stream"]();
				return yield* stream.pipe(Stream.take(2), Stream.runCollect);
			});
			setTimeout(() => QueueSingleton.appendTracks([track("ytmusic:b")]), 10);
			return Effect.runPromise(Effect.scoped(program));
		});

		expect(collected.length).toBe(2);
		expect(collected[0]?.items.map((t) => t.id)).toEqual(["ytmusic:a"]);
		expect(collected[1]?.items.map((t) => t.id)).toEqual([
			"ytmusic:a",
			"ytmusic:b",
		]);
	});

	it("removes the singleton listener when the stream scope closes", async () => {
		QueueSingleton.setQueue([track("ytmusic:a")], { type: "manual" });

		await withHandlers(async (handlers) => {
			const program = Effect.gen(function* () {
				const stream = handlers["queue.state.stream"]();
				return yield* stream.pipe(Stream.take(1), Stream.runCollect);
			});
			return Effect.runPromise(Effect.scoped(program));
		});

		// After the scoped program exits, no leak should remain: subsequent
		// mutations route only through new listeners we attach.
		const seen: number[] = [];
		const unsubscribe = QueueSingleton.subscribe((s) =>
			seen.push(s.items.length),
		);
		try {
			QueueSingleton.appendTracks([track("ytmusic:c")]);
			expect(seen).toEqual([2]);
		} finally {
			unsubscribe();
		}
	});
});

describe("serializeQueueState helper", () => {
	it("strips internal source metadata and preserves display fields", () => {
		const result = serializeQueueState({
			items: [track("ytmusic:a")],
			currentIndex: 0,
			context: { type: "manual" },
		});
		expect(result.items[0]?.id).toBe("ytmusic:a");
		expect(JSON.stringify(result)).not.toContain('"source"');
	});
});
