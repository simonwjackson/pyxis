/**
 * @module server/rpc/services/player tests
 * Behavior tests for the Effect Player service.
 *
 * The Live layer composes against the real `server/services/player` and
 * `server/services/queue` singletons so RPC handlers, Android bridge, and
 * persistence keep observing one player state authority.
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { Effect } from "effect";
import * as PlayerSingleton from "../../services/player.js";
import type { QueueTrack } from "../../services/queue.js";
import * as QueueSingleton from "../../services/queue.js";
import { Player, PlayerLayerLive } from "./player.js";

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

const runLive = <A, E>(effect: Effect.Effect<A, E, Player>) =>
  Effect.runPromise(Effect.provide(effect, PlayerLayerLive));

describe("Player service (Live)", () => {
  beforeEach(() => {
    PlayerSingleton.stop();
    QueueSingleton.clear();
  });

  it("getState reflects the singleton", async () => {
    PlayerSingleton.play([track("1")], { type: "manual" });
    const state = await runLive(
      Effect.gen(function* () {
        const p = yield* Player;
        return yield* p.getState;
      }),
    );
    expect(state.status).toBe("playing");
    expect(state.currentTrack?.id).toBe("1");
  });

  it("play replaces the singleton queue and starts playback", async () => {
    const state = await runLive(
      Effect.gen(function* () {
        const p = yield* Player;
        return yield* p.play([track("1"), track("2")], {
          type: "album",
          albumId: "abc",
        });
      }),
    );
    expect(state.status).toBe("playing");
    expect(state.currentTrack?.id).toBe("1");
    expect(PlayerSingleton.getState().queueContext.type).toBe("album");
  });

  it("pause + resume go through the singleton", async () => {
    PlayerSingleton.play([track("1")], { type: "manual" });

    await runLive(
      Effect.gen(function* () {
        const p = yield* Player;
        yield* p.pause;
      }),
    );
    expect(PlayerSingleton.getState().status).toBe("paused");

    await runLive(
      Effect.gen(function* () {
        const p = yield* Player;
        yield* p.resume;
      }),
    );
    expect(PlayerSingleton.getState().status).toBe("playing");
  });

  it("skip advances the singleton currentTrack", async () => {
    PlayerSingleton.play([track("1"), track("2")], { type: "manual" });
    const state = await runLive(
      Effect.gen(function* () {
        const p = yield* Player;
        return yield* p.skip;
      }),
    );
    expect(state.currentTrack?.id).toBe("2");
    expect(QueueSingleton.getState().currentIndex).toBe(1);
  });

  it("seek and reportProgress sync the singleton", async () => {
    PlayerSingleton.play([track("1")], { type: "manual" });
    await runLive(
      Effect.gen(function* () {
        const p = yield* Player;
        yield* p.seek(45);
      }),
    );
    PlayerSingleton.pause();
    expect(PlayerSingleton.getState().progress).toBeGreaterThanOrEqual(45);

    await runLive(
      Effect.gen(function* () {
        const p = yield* Player;
        yield* p.reportProgress(120);
      }),
    );
    expect(PlayerSingleton.getState().progress).toBe(120);
  });

  it("setVolume clamps via the singleton", async () => {
    await runLive(
      Effect.gen(function* () {
        const p = yield* Player;
        yield* p.setVolume(150);
      }),
    );
    expect(PlayerSingleton.getState().volume).toBe(100);

    await runLive(
      Effect.gen(function* () {
        const p = yield* Player;
        yield* p.setVolume(-10);
      }),
    );
    expect(PlayerSingleton.getState().volume).toBe(0);
  });

  it("subscribe routes events through the singleton subscriber list", async () => {
    const seen: string[] = [];
    const unsubscribe = await runLive(
      Effect.gen(function* () {
        const p = yield* Player;
        return yield* p.subscribe((state) =>
          seen.push(state.currentTrack?.id ?? "none"),
        );
      }),
    );

    PlayerSingleton.play([track("1")], { type: "manual" });
    expect(seen.length).toBeGreaterThanOrEqual(1);
    expect(seen.at(-1)).toBe("1");

    unsubscribe();
    const before = seen.length;
    PlayerSingleton.pause();
    expect(seen.length).toBe(before);
  });
});
