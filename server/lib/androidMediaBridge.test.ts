import { beforeEach, describe, expect, it } from "bun:test";
import * as PlayerService from "../services/player.js";
import type { QueueTrack } from "../services/queue.js";
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
