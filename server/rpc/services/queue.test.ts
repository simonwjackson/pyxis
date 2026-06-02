/**
 * @module server/rpc/services/queue tests
 * Behavior tests for the Effect Queue service.
 *
 * The Live layer is verified by composing it with the real
 * `server/services/queue` singleton so RPC handlers and persistence keep
 * observing the same authoritative queue state.
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { Effect } from "effect";
import type { QueueState, QueueTrack } from "../../services/queue.js";
import * as QueueSingleton from "../../services/queue.js";
import { Queue, QueueLayerFromAuthority, QueueLayerLive } from "./queue.js";

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

const runLive = <A, E>(effect: Effect.Effect<A, E, Queue>) =>
  Effect.runPromise(Effect.provide(effect, QueueLayerLive));

describe("Queue service (Live)", () => {
  beforeEach(() => {
    QueueSingleton.clear();
  });

  it("getState delegates to the singleton", async () => {
    QueueSingleton.setQueue([track("1"), track("2")], { type: "manual" });
    const state = await runLive(
      Effect.gen(function* () {
        const q = yield* Queue;
        return yield* q.getState;
      }),
    );
    expect(state.items.map((t) => t.id)).toEqual(["1", "2"]);
    expect(state.currentIndex).toBe(0);
  });

  it("setQueue mutates the singleton state", async () => {
    await runLive(
      Effect.gen(function* () {
        const q = yield* Queue;
        return yield* q.setQueue([track("1"), track("2")], {
          type: "manual",
        });
      }),
    );
    expect(QueueSingleton.getState().items.map((t) => t.id)).toEqual([
      "1",
      "2",
    ]);
  });

  it("jumpTo updates the singleton currentIndex", async () => {
    QueueSingleton.setQueue([track("1"), track("2"), track("3")], {
      type: "manual",
    });
    const state = await runLive(
      Effect.gen(function* () {
        const q = yield* Queue;
        return yield* q.jumpTo(2);
      }),
    );
    expect(state.currentIndex).toBe(2);
    expect(QueueSingleton.getState().currentIndex).toBe(2);
  });

  it("invalid jump is a no-op", async () => {
    QueueSingleton.setQueue([track("1")], { type: "manual" });
    await runLive(
      Effect.gen(function* () {
        const q = yield* Queue;
        return yield* q.jumpTo(99);
      }),
    );
    expect(QueueSingleton.getState().currentIndex).toBe(0);
  });

  it("clear resets the singleton to manual context", async () => {
    QueueSingleton.setQueue([track("1")], {
      type: "album",
      albumId: "abc",
    });
    await runLive(
      Effect.gen(function* () {
        const q = yield* Queue;
        return yield* q.clear;
      }),
    );
    expect(QueueSingleton.getState().items).toEqual([]);
    expect(QueueSingleton.getState().context.type).toBe("manual");
  });

  it("subscribe registers a singleton listener and the unsubscribe stops notifications", async () => {
    const updates: QueueState[] = [];
    const unsubscribe = await runLive(
      Effect.gen(function* () {
        const q = yield* Queue;
        return yield* q.subscribe((state) => updates.push(state));
      }),
    );
    QueueSingleton.setQueue([track("1")], { type: "manual" });
    expect(updates.length).toBe(1);
    expect(updates[0]?.items[0]?.id).toBe("1");

    unsubscribe();
    QueueSingleton.setQueue([track("2")], { type: "manual" });
    expect(updates.length).toBe(1);
  });
});

describe("Queue service (in-memory behavior)", () => {
  it("tests can drive the service without touching the singleton", async () => {
    let stored: readonly QueueTrack[] = [];
    const state = (): QueueState => ({
      items: stored,
      currentIndex: 0,
      context: { type: "manual" },
    });
    const layer = QueueLayerFromAuthority({
      getState: state,
      setQueue: (tracks) => {
        stored = tracks;
      },
      addTracks: (tracks) => {
        stored = [...stored, ...tracks];
      },
      removeTrack: () => {},
      clear: () => {
        stored = [];
      },
      jumpTo: () => {},
      shuffle: () => {},
      subscribe: () => () => {},
    });

    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const q = yield* Queue;
          yield* q.setQueue([track("a")], { type: "manual" });
          return yield* q.getState;
        }),
        layer,
      ),
    );

    expect(result.items.map((t) => t.id)).toEqual(["a"]);
  });
});
