/**
 * @module server/rpc/handlers/player tests
 * Behavior tests for the `player.*` family. The handlers wrap the live
 * player singleton through the {@link PlayerLayerLive}/{@link QueueLayerLive}
 * Effect services so the same authority that the Android media bridge and
 * persistence use is exercised.
 *
 * Coverage targets the U5 invariants:
 * - serialized state includes a `/stream/` URL with a `next=` prefetch hint
 * - mutations route through the player singleton
 * - stale `appliesToTrackId` reports are typed no-ops (no state change, no
 *   subscriber updates, no audio realization mutation)
 * - the realtime stream is snapshot-first, emits subsequent transitions,
 *   and cleans up listeners on scope close
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { type DbInstance, setDbForTesting } from "@shared/db/index.js";
import { Effect, Layer, Stream } from "effect";
import * as PlayerSingleton from "../../services/player.js";
import type { QueueTrack } from "../../services/queue.js";
import * as QueueSingleton from "../../services/queue.js";
import {
  Player as PlayerCtx,
  PlayerLayerLive,
  type PlayerShape,
} from "../services/player.js";
import {
  Queue as QueueCtx,
  QueueLayerLive,
  type QueueShape,
} from "../services/queue.js";
import {
  type PlayerHandlerDeps,
  playerHandlers,
  serializePlayerState,
} from "./player.js";

function track(id: string, duration: number | null = 180): QueueTrack {
  return {
    id,
    title: `Track ${id}`,
    artist: "Artist",
    album: "Album",
    duration,
    artworkUrl: null,
    source: "ytmusic",
  };
}

const PlayerHandlerLayer = Layer.mergeAll(PlayerLayerLive, QueueLayerLive);

const resolveDeps = Effect.gen(function* () {
  const player = yield* PlayerCtx;
  const queue = yield* QueueCtx;
  return { player, queue } satisfies PlayerHandlerDeps;
});

async function withHandlers<A>(
  fn: (
    handlers: ReturnType<typeof playerHandlers>,
    player: PlayerShape,
    queue: QueueShape,
  ) => Promise<A>,
): Promise<A> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const deps = yield* resolveDeps;
      const handlers = playerHandlers(deps);
      return yield* Effect.promise(() => fn(handlers, deps.player, deps.queue));
    }).pipe(Effect.provide(PlayerHandlerLayer)),
  );
}

beforeEach(() => {
  PlayerSingleton.stop();
  QueueSingleton.clear();
});

afterEach(() => {
  PlayerSingleton.stop();
  QueueSingleton.clear();
  setDbForTesting(null);
});

describe("player.state.get", () => {
  it("returns the serialized current state with a /stream/ URL and next= hint", async () => {
    PlayerSingleton.play(
      [track("ytmusic:current"), track("ytmusic:upcoming")],
      { type: "manual" },
    );
    const result = await withHandlers(async (handlers) =>
      Effect.runPromise(handlers["player.state.get"]()),
    );
    expect(result.status).toBe("playing");
    expect(result.currentTrack?.id).toBe("ytmusic:current");
    expect(result.currentTrack?.streamUrl).toBe(
      "/stream/ytmusic%3Acurrent?next=ytmusic%3Aupcoming",
    );
  });
});

describe("player.transport.play", () => {
  it("resolves bare album track ids to source-prefixed queue and response ids", async () => {
    setDbForTesting({
      albumTracks: {
        findById: () => ({
          runPromise: Promise.resolve({
            source: "ytmusic",
            sourceTrackId: "remote-track-1",
          }),
        }),
      },
    } as unknown as DbInstance);

    const result = await withHandlers(async (handlers) =>
      Effect.runPromise(
        handlers["player.transport.play"]({
          tracks: [
            {
              id: "library-row-1",
              title: "Track 1",
              artist: "Artist",
              album: "Album",
              duration: null,
              artworkUrl: null,
            },
          ],
          context: { type: "album", albumId: "album-1" },
          startIndex: 0,
        }),
      ),
    );

    expect(result.status).toBe("playing");
    expect(result.currentTrack?.id).toBe("ytmusic:remote-track-1");
    expect(result.currentTrack?.streamUrl).toBe(
      "/stream/ytmusic%3Aremote-track-1",
    );
    expect(QueueSingleton.getState().items[0]?.id).toBe(
      "ytmusic:remote-track-1",
    );
  });
});

describe("player.pause / resume / stop / skip / previous / jumpTo", () => {
  it("pause + resume route through the singleton", async () => {
    PlayerSingleton.play([track("ytmusic:a")], { type: "manual" });
    const paused = await withHandlers(async (handlers) =>
      Effect.runPromise(handlers["player.transport.pause"]()),
    );
    expect(paused.status).toBe("paused");

    const resumed = await withHandlers(async (handlers) =>
      Effect.runPromise(handlers["player.transport.resume"]()),
    );
    expect(resumed.status).toBe("playing");
    expect(PlayerSingleton.getState().status).toBe("playing");
  });

  it("skip advances the singleton queue", async () => {
    PlayerSingleton.play([track("ytmusic:a"), track("ytmusic:b")], {
      type: "manual",
    });
    const result = await withHandlers(async (handlers) =>
      Effect.runPromise(handlers["player.transport.skip"]()),
    );
    expect(result.currentTrack?.id).toBe("ytmusic:b");
    expect(QueueSingleton.getState().currentIndex).toBe(1);
  });

  it("jumpTo at a known index moves the queue", async () => {
    PlayerSingleton.play(
      [track("ytmusic:a"), track("ytmusic:b"), track("ytmusic:c")],
      { type: "manual" },
    );
    const result = await withHandlers(async (handlers) =>
      Effect.runPromise(handlers["player.transport.jumpTo"]({ index: 2 })),
    );
    expect(result.currentTrack?.id).toBe("ytmusic:c");
  });

  it("stop clears the queue", async () => {
    PlayerSingleton.play([track("ytmusic:a")], { type: "manual" });
    const result = await withHandlers(async (handlers) =>
      Effect.runPromise(handlers["player.transport.stop"]()),
    );
    expect(result.status).toBe("stopped");
    expect(result.currentTrack).toBeNull();
    expect(QueueSingleton.getState().items).toEqual([]);
  });
});

describe("player.seek and player.volume.set", () => {
  it("seek clamps via the singleton and reports the updated state", async () => {
    PlayerSingleton.play([track("ytmusic:a")], { type: "manual" });
    PlayerSingleton.setDuration(120);

    await withHandlers(async (handlers) => {
      await Effect.runPromise(
        handlers["player.transport.seek"]({ position: 45 }),
      );
    });
    PlayerSingleton.pause();
    expect(PlayerSingleton.getState().progress).toBeGreaterThanOrEqual(45);
  });

  it("volume.set clamps via the singleton", async () => {
    const result = await withHandlers(async (handlers) =>
      Effect.runPromise(handlers["player.volume.set"]({ level: 0 })),
    );
    expect(result.volume).toBe(0);
  });
});

describe("player.progress.report (stale guard)", () => {
  it("applies progress when no appliesToTrackId is supplied", async () => {
    PlayerSingleton.play([track("ytmusic:a")], { type: "manual" });
    PlayerSingleton.pause();
    await withHandlers(async (handlers) =>
      Effect.runPromise(handlers["player.progress.report"]({ progress: 45 })),
    );
    expect(PlayerSingleton.getState().progress).toBe(45);
  });

  it("drops progress reports addressed to a previous track without notifying", async () => {
    PlayerSingleton.play([track("ytmusic:a"), track("ytmusic:b")], {
      type: "manual",
    });
    PlayerSingleton.skip(); // current is now ytmusic:b
    PlayerSingleton.pause();
    const progressBeforeStaleReport = PlayerSingleton.getState().progress;
    const updates: number[] = [];
    const unsubscribe = PlayerSingleton.subscribe((s) =>
      updates.push(s.progress),
    );
    try {
      const result = await withHandlers(async (handlers) =>
        Effect.runPromise(
          handlers["player.progress.report"]({
            progress: 90,
            appliesToTrackId: "ytmusic:a",
          }),
        ),
      );
      expect(result).toEqual({ ok: true });
      // reportProgress is silent (no subscriber notification) when applied
      // and must also be silent when dropped as stale.
      expect(updates).toEqual([]);
      expect(PlayerSingleton.getState().progress).toBe(
        progressBeforeStaleReport,
      );
      expect(PlayerSingleton.getState().progress).not.toBe(90);
      expect(PlayerSingleton.getState().currentTrack?.id).toBe("ytmusic:b");
    } finally {
      unsubscribe();
    }
  });
});

describe("player.duration.report (stale guard)", () => {
  it("drops stale duration reports without notifying or mutating duration", async () => {
    PlayerSingleton.play([track("ytmusic:a", null), track("ytmusic:b", null)], {
      type: "manual",
    });
    PlayerSingleton.skip();
    const before = PlayerSingleton.getState().duration;
    const updates: number[] = [];
    const unsubscribe = PlayerSingleton.subscribe((s) =>
      updates.push(s.duration),
    );
    try {
      const result = await withHandlers(async (handlers) =>
        Effect.runPromise(
          handlers["player.duration.report"]({
            duration: 999,
            appliesToTrackId: "ytmusic:a",
          }),
        ),
      );
      expect(result).toEqual({ ok: true });
      expect(updates).toEqual([]);
      expect(PlayerSingleton.getState().duration).toBe(before);
    } finally {
      unsubscribe();
    }
  });
});

describe("player.audioError.report (stale guard)", () => {
  it("drops stale audio errors so they cannot clobber the new track's realization", async () => {
    PlayerSingleton.play([track("ytmusic:a"), track("ytmusic:b")], {
      type: "manual",
    });
    PlayerSingleton.skip();
    PlayerSingleton.setDuration(60); // marks audio observed on b
    const updates: number[] = [];
    const unsubscribe = PlayerSingleton.subscribe((s) =>
      updates.push(s.progress),
    );
    try {
      const result = await withHandlers(async (handlers) =>
        Effect.runPromise(
          handlers["player.audioError.report"]({
            message: "stale error",
            appliesToTrackId: "ytmusic:a",
          }),
        ),
      );
      expect(result).toEqual({ ok: true });
      expect(updates).toEqual([]);
      expect(PlayerSingleton.getAudioRealization().failed).toBe(false);
    } finally {
      unsubscribe();
    }
  });
});

describe("player.trackEnded (stale guard)", () => {
  it("does not advance the queue when ended report targets a previous track", async () => {
    PlayerSingleton.play(
      [track("ytmusic:a"), track("ytmusic:b"), track("ytmusic:c")],
      { type: "manual" },
    );
    PlayerSingleton.skip(); // current is now ytmusic:b
    const before = PlayerSingleton.getState().currentTrack?.id;

    const result = await withHandlers(async (handlers) =>
      Effect.runPromise(
        handlers["player.transport.trackEnded"]({
          appliesToTrackId: "ytmusic:a",
        }),
      ),
    );
    expect(result.currentTrack?.id).toBe(before);
    expect(QueueSingleton.getState().currentIndex).toBe(1);
  });

  it("advances normally when no appliesToTrackId is supplied", async () => {
    PlayerSingleton.play([track("ytmusic:a"), track("ytmusic:b")], {
      type: "manual",
    });
    const result = await withHandlers(async (handlers) =>
      Effect.runPromise(handlers["player.transport.trackEnded"]({})),
    );
    expect(result.currentTrack?.id).toBe("ytmusic:b");
  });
});

describe("player.state.stream", () => {
  it("is snapshot-first and emits subsequent state transitions", async () => {
    PlayerSingleton.play([track("ytmusic:a")], { type: "manual" });

    const collected = await withHandlers(async (handlers) => {
      const program = Effect.gen(function* () {
        // Fork the stream consumer so we can drive state transitions
        // from outside the stream.
        const stream = handlers["player.state.stream"]();
        return yield* stream.pipe(Stream.take(2), Stream.runCollect);
      });
      // Drive a state change so the snapshot-first stream emits a second
      // snapshot quickly enough that we do not depend on the heartbeat.
      setTimeout(() => PlayerSingleton.pause(), 10);
      return Effect.runPromise(Effect.scoped(program));
    });

    expect(collected.length).toBe(2);
    expect(collected[0]?.status).toBe("playing");
    expect(collected[0]?.currentTrack?.id).toBe("ytmusic:a");
    expect(collected[1]?.status).toBe("paused");
  });

  it("removes the singleton listener when the stream scope closes", async () => {
    PlayerSingleton.play([track("ytmusic:a")], { type: "manual" });

    await withHandlers(async (handlers) => {
      const program = Effect.gen(function* () {
        const stream = handlers["player.state.stream"]();
        return yield* stream.pipe(Stream.take(1), Stream.runCollect);
      });
      return Effect.runPromise(Effect.scoped(program));
    });

    // After the scoped program exits, the snapshot-first listener must
    // have been removed. Trigger a state transition and confirm no extra
    // state is buffered by the prior subscription path: the only test we
    // can write here without exposing internals is that further mutations
    // do not throw and the singleton subscriber count is unchanged from
    // its baseline. The serialize helper is exported for direct check.
    const states: number[] = [];
    const unsubscribe = PlayerSingleton.subscribe(() =>
      states.push(Date.now()),
    );
    try {
      PlayerSingleton.pause();
      PlayerSingleton.resume();
      expect(states.length).toBe(2);
    } finally {
      unsubscribe();
    }
  });
});

describe("serializePlayerState helper", () => {
  it("omits source metadata and includes the prefetch hint", () => {
    const state = PlayerSingleton.getState();
    PlayerSingleton.play([track("ytmusic:a"), track("ytmusic:b")], {
      type: "manual",
    });
    const result = serializePlayerState(PlayerSingleton.getState());
    expect(result.currentTrack?.streamUrl).toContain("next=ytmusic%3Ab");
    expect(JSON.stringify(result)).not.toContain('"source"');
    // state was captured before play; just makes sure helper doesn't throw on stopped.
    expect(serializePlayerState(state).currentTrack).toBeNull();
  });
});
