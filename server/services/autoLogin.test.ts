import { beforeEach, describe, expect, it } from "bun:test";
import type { Logger } from "@shared/logger.js";
import type { SourceType } from "@shared/sources/types.js";
import { refreshRestoredRadioQueue } from "./autoLogin.js";
import * as Player from "./player.js";
import type { QueueTrack } from "./queue.js";
import * as Queue from "./queue.js";

function track(id: string, duration: number | null): QueueTrack {
  return {
    id: `pandora:${id}`,
    title: id,
    artist: "Artist",
    album: "Album",
    duration,
    artworkUrl: null,
    source: "pandora",
  };
}

function logger(messages: string[]): Logger {
  return {
    info: (_fields: unknown, message?: string) =>
      messages.push(message ?? String(_fields)),
    warn: (_fields: unknown, message?: string) =>
      messages.push(message ?? String(_fields)),
  } as unknown as Logger;
}

describe("restored radio queue recovery", () => {
  beforeEach(() => {
    Player.stop();
    Queue.clear();
    Player.setVolume(100);
  });

  it("atomically replaces stale tracks in paused state and preserves volume/context", async () => {
    const stale = track("stale", 200);
    const fresh = [track("fresh-1", 180), track("fresh-2", 210)];
    Player.play([stale], { type: "radio", seedId: "pandora:station" });
    Player.setVolume(17);
    Player.seek(40);
    Player.pause();
    const observedStatuses: string[] = [];
    const unsubscribe = Player.subscribe((state) =>
      observedStatuses.push(state.status),
    );
    const calls: Array<{ source: SourceType; id: string }> = [];

    const refreshed = await refreshRestoredRadioQueue(
      logger([]),
      async (source, id) => {
        calls.push({ source, id });
        return fresh;
      },
    );
    unsubscribe();

    expect(refreshed).toBe(true);
    expect(calls).toEqual([{ source: "pandora", id: "station" }]);
    expect(Queue.getState()).toEqual({
      items: fresh,
      currentIndex: 0,
      context: { type: "radio", seedId: "pandora:station" },
    });
    expect(Player.getState()).toMatchObject({
      status: "paused",
      currentTrack: fresh[0],
      nextTrack: fresh[1],
      progress: 0,
      duration: 180,
      volume: 17,
      queueContext: { type: "radio", seedId: "pandora:station" },
    });
    expect(observedStatuses).toEqual(["paused"]);
  });

  it("keeps the restored paused queue when refresh fails", async () => {
    const stale = track("stale", 200);
    Player.play([stale], { type: "radio", seedId: "pandora:station" });
    Player.setVolume(9);
    Player.pause();
    const messages: string[] = [];

    const refreshed = await refreshRestoredRadioQueue(
      logger(messages),
      async () => {
        throw new Error("station unavailable");
      },
    );

    expect(refreshed).toBe(false);
    expect(Queue.currentTrack()).toEqual(stale);
    expect(Player.getState()).toMatchObject({ status: "paused", volume: 9 });
    expect(messages).toContain(
      "failed to refresh restored radio queue; keeping paused queue",
    );
  });
});
