import { beforeEach, describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { playerHandlers } from "../rpc/handlers/player.js";
import { Player, PlayerLayerFromAuthority } from "../rpc/services/player.js";
import { Queue, QueueLayerFromBehavior } from "../rpc/services/queue.js";
import * as PlayerService from "../services/player.js";
import type { PlayerAuthority } from "../services/playerAuthority.js";
import type { QueueContext, QueueTrack } from "../services/queue.js";
import {
  createAndroidMediaBridge,
  isAndroidMediaBridgeRequest,
} from "./androidMediaBridge.js";

function track(id = "ytmusic:bridge-track-1"): QueueTrack {
  return {
    id,
    title: "Bridge Track",
    artist: "Bridge Artist",
    album: "Bridge Album",
    duration: 120,
    artworkUrl: null,
    source: "ytmusic",
  };
}

function request(path: string, init: RequestInit = {}): Request {
  return new Request(`http://pyxis.test${path}`, init);
}

function createTestPlayerAuthority(): PlayerAuthority {
  let state: PlayerService.PlayerState = {
    status: "playing",
    currentTrack: track(),
    nextTrack: null,
    progress: 0,
    duration: 120,
    volume: 100,
    updatedAt: 1,
    queueContext: { type: "manual" },
  };
  const listeners = new Set<(next: PlayerService.PlayerState) => void>();
  const publish = (next: PlayerService.PlayerState) => {
    state = next;
    for (const listener of listeners) listener(state);
  };

  return {
    getState: () => state,
    getAudioRealization: () => ({
      observedAt: null,
      failed: false,
      error: null,
    }),
    play: (tracks?: readonly QueueTrack[], context?: QueueContext) => {
      const currentTrack = tracks?.[0] ?? state.currentTrack;
      publish({
        ...state,
        status: currentTrack ? "playing" : "stopped",
        currentTrack,
        queueContext: context ?? state.queueContext,
        updatedAt: state.updatedAt + 1,
      });
    },
    pause: () =>
      publish({ ...state, status: "paused", updatedAt: state.updatedAt + 1 }),
    resume: () =>
      publish({ ...state, status: "playing", updatedAt: state.updatedAt + 1 }),
    stop: () =>
      publish({
        ...state,
        status: "stopped",
        currentTrack: null,
        updatedAt: state.updatedAt + 1,
      }),
    skip: () => undefined,
    previousTrack: () => undefined,
    jumpToIndex: () => undefined,
    seek: (position: number) =>
      publish({ ...state, progress: position, updatedAt: state.updatedAt + 1 }),
    setVolume: (level: number) =>
      publish({ ...state, volume: level, updatedAt: state.updatedAt + 1 }),
    setDuration: (duration: number) => {
      publish({ ...state, duration, updatedAt: state.updatedAt + 1 });
      return true;
    },
    reportProgress: (progress: number) => {
      state = { ...state, progress };
      return true;
    },
    reportAudioError: () => true,
    trackEnded: () => undefined,
    subscribe: (listener: (next: PlayerService.PlayerState) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

async function json(response: Response): Promise<unknown> {
  return response.json();
}

describe("android media bridge HTTP boundary", () => {
  beforeEach(() => {
    PlayerService.stop();
  });

  it("recognizes only bridge paths", () => {
    expect(
      isAndroidMediaBridgeRequest(
        new URL("http://x/android-media-bridge/state"),
      ),
    ).toBe(true);
    expect(
      isAndroidMediaBridgeRequest(new URL("http://x/trpc/player.getState")),
    ).toBe(false);
  });

  it("returns an authorized state snapshot", async () => {
    PlayerService.play([track()], { type: "manual" });
    PlayerService.reportProgress(5);
    const bridge = createAndroidMediaBridge({
      enabled: true,
      token: "secret",
      now: () => 1001,
    });

    const response = await bridge.handle(
      request("/android-media-bridge/state", {
        headers: { "x-pyxis-bridge-token": "secret" },
      }),
    );
    const body = (await json(response)) as {
      currentTrack: { title: string };
      availableActions: string[];
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.currentTrack.title).toBe("Bridge Track");
    expect(body.availableActions).toContain("pause");
  });

  it("rejects missing or invalid tokens before command payload changes state", async () => {
    PlayerService.play([track()], { type: "manual" });
    const bridge = createAndroidMediaBridge({
      enabled: true,
      token: "secret",
      now: () => 1001,
    });

    const response = await bridge.handle(
      request("/android-media-bridge/commands", {
        method: "POST",
        body: JSON.stringify({ action: "pause" }),
      }),
    );

    expect(response.status).toBe(401);
    expect(PlayerService.getState().status).toBe("playing");
  });

  it("lets Android commands and Effect RPC reads observe the same injected player authority", async () => {
    const authority = createTestPlayerAuthority();
    const bridge = createAndroidMediaBridge({
      enabled: true,
      token: "secret",
      now: () => 1001,
      player: authority,
    });
    const playerLayer = PlayerLayerFromAuthority(authority);
    const queueLayer = QueueLayerFromBehavior({
      getState: () => ({
        items: [],
        currentIndex: 0,
        context: { type: "manual" },
      }),
      setQueue: () => undefined,
      addTracks: () => undefined,
      removeTrack: () => undefined,
      clear: () => undefined,
      jumpTo: () => undefined,
      shuffle: () => undefined,
      subscribe: () => () => undefined,
    });

    const pauseResponse = await bridge.handle(
      request("/android-media-bridge/commands", {
        method: "POST",
        headers: {
          "x-pyxis-bridge-token": "secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ action: "pause", correlationId: "pause-1" }),
      }),
    );
    const pauseBody = (await json(pauseResponse)) as {
      outcome: string;
      state: { status: string };
    };
    const rpcState = await Effect.runPromise(
      Effect.gen(function* () {
        const player = yield* Player;
        const queue = yield* Queue;
        const handlers = playerHandlers({ player, queue });
        return yield* handlers["player.state.get"]();
      }).pipe(Effect.provide(playerLayer), Effect.provide(queueLayer)),
    );

    expect(pauseResponse.status).toBe(200);
    expect(pauseBody.outcome).toBe("applied");
    expect(pauseBody.state.status).toBe("paused");
    expect(rpcState.status).toBe("paused");
  });

  it("routes authorized pause and play commands through player authority", async () => {
    PlayerService.play([track()], { type: "manual" });
    const bridge = createAndroidMediaBridge({
      enabled: true,
      token: "secret",
      now: () => 1001,
    });

    const pauseResponse = await bridge.handle(
      request("/android-media-bridge/commands", {
        method: "POST",
        headers: {
          "x-pyxis-bridge-token": "secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "pause",
          correlationId: "pause-1",
          source: "test",
        }),
      }),
    );
    const pauseBody = (await json(pauseResponse)) as {
      outcome: string;
      state: { status: string };
    };

    expect(pauseResponse.status).toBe(200);
    expect(pauseBody.outcome).toBe("applied");
    expect(pauseBody.state.status).toBe("paused");
    expect(PlayerService.getState().status).toBe("paused");

    const playResponse = await bridge.handle(
      request("/android-media-bridge/commands", {
        method: "POST",
        headers: {
          "x-pyxis-bridge-token": "secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "play",
          correlationId: "play-1",
          source: "test",
        }),
      }),
    );
    const playBody = (await json(playResponse)) as {
      outcome: string;
      state: { status: string };
    };

    expect(playBody.outcome).toBe("applied");
    expect(playBody.state.status).toBe("playing");
  });

  it("emits initial and subsequent state events", async () => {
    PlayerService.play([track("ytmusic:first")], { type: "manual" });
    const bridge = createAndroidMediaBridge({
      enabled: true,
      token: "secret",
      now: () => 1001,
    });

    const response = await bridge.handle(
      request("/android-media-bridge/events", {
        headers: { "x-pyxis-bridge-token": "secret" },
      }),
    );
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    const first = await reader?.read();
    PlayerService.skip();
    reader?.cancel().catch(() => undefined);

    expect(response.status).toBe(200);
    expect(new TextDecoder().decode(first.value)).toContain("event: state");
  });

  it("bounds command storms", async () => {
    PlayerService.play([track()], { type: "manual" });
    const bridge = createAndroidMediaBridge({
      enabled: true,
      token: "secret",
      now: () => 1001,
      commandLimit: { max: 1, windowMs: 10_000 },
    });
    const init = {
      method: "POST",
      headers: {
        "x-pyxis-bridge-token": "secret",
        "content-type": "application/json",
      },
      body: JSON.stringify({ action: "pause" }),
    };

    await bridge.handle(request("/android-media-bridge/commands", init));
    const second = await bridge.handle(
      request("/android-media-bridge/commands", init),
    );

    expect(second.status).toBe(429);
  });
});
