import { describe, expect, it } from "bun:test";
import type { ApiPlaybackOutputState } from "@shared/api/contracts/output.js";
import { decodeConfig } from "@shared/config.js";
import type { PlayerState } from "../services/player.js";
import type { SonosRoom, SonosTopology } from "./model.js";
import {
  buildSonosStreamUrl,
  makeSonosPlaybackCoordinator,
  type SonosCanonicalPlayer,
  type SonosPlaybackProtocol,
} from "./playback.js";

function room(uuid: string, coordinator: boolean): SonosRoom {
  return {
    uuid,
    name: uuid,
    model: null,
    address: "192.168.1.10",
    locationUrl: "http://192.168.1.10:1400/xml/device_description.xml",
    isCoordinator: coordinator,
  };
}

const anchor = room("ANCHOR", false);
const coordinatorRoom = room("COORD", true);
const movedCoordinator = room("MOVED", true);

function topology(
  coordinator = coordinatorRoom,
  includeAnchor = true,
): SonosTopology {
  return {
    enabled: true,
    available: true,
    refreshedAt: 1,
    groups: [
      {
        id: "group",
        coordinatorUuid: coordinator.uuid,
        coordinatorName: coordinator.name,
        rooms: includeAnchor ? [anchor, coordinator] : [coordinator],
      },
    ],
  };
}

function state(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    status: "playing",
    currentTrack: {
      id: "ytmusic:track",
      title: "Track",
      artist: "Artist",
      album: "Album",
      duration: 120,
      artworkUrl: "http://art/cover.jpg",
      source: "ytmusic",
    },
    nextTrack: null,
    progress: 10,
    duration: 120,
    volume: 35,
    updatedAt: 1000,
    queueContext: { type: "manual" },
    ...overrides,
  };
}

function harness(
  options: {
    initialState?: PlayerState;
    positionUri?: string;
    transportState?: string;
    position?: number;
    duration?: number;
    topology?: SonosTopology;
    setUriError?: Error;
    setVolumeError?: Error;
  } = {},
) {
  let playerState = options.initialState ?? state();
  let currentTopology = options.topology ?? topology();
  let output: ApiPlaybackOutputState = {
    type: "sonos",
    roomUuid: "ANCHOR",
    roomName: "ANCHOR",
    coordinatorUuid: "COORD",
    coordinatorName: "COORD",
    available: true,
    updatedAt: 1,
  };
  let currentUri = options.positionUri ?? null;
  let transportState = options.transportState ?? "PLAYING";
  let currentPosition = options.position ?? 10;
  let currentDuration = options.duration ?? 120;
  let clock = 2000;
  const calls: string[] = [];
  const listeners = new Set<() => void>();
  const notify = () =>
    listeners.forEach((listener) => {
      listener();
    });
  const player: SonosCanonicalPlayer = {
    getState: async () => playerState,
    pause: async () => {
      calls.push("canonical:pause");
      playerState = { ...playerState, status: "paused" };
      notify();
      return playerState;
    },
    resume: async () => {
      calls.push("canonical:resume");
      playerState = { ...playerState, status: "playing" };
      notify();
      return playerState;
    },
    setDuration: async (seconds) => {
      calls.push(`canonical:duration:${seconds}`);
      playerState = { ...playerState, duration: seconds };
      notify();
      return playerState;
    },
    reportProgress: async (seconds) => {
      calls.push(`canonical:progress:${seconds}`);
      playerState = { ...playerState, progress: seconds };
      return true;
    },
    setVolume: async (volume) => {
      calls.push(`canonical:volume:${volume}`);
      playerState = { ...playerState, volume };
      notify();
      return playerState;
    },
    trackEnded: async (trackId) => {
      calls.push(`canonical:ended:${trackId}`);
      playerState = playerState.nextTrack
        ? {
            ...playerState,
            status: "playing",
            currentTrack: playerState.nextTrack,
            nextTrack: null,
            progress: 0,
          }
        : { ...playerState, status: "stopped", currentTrack: null };
      notify();
      return playerState;
    },
    reportInterrupted: async (trackId) => {
      calls.push(`canonical:interrupted:${trackId}`);
      notify();
      return playerState;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const protocol: SonosPlaybackProtocol = {
    setUri: async (target, uri) => {
      calls.push(`setUri:${target.uuid}`);
      if (options.setUriError) throw options.setUriError;
      currentUri = uri;
    },
    play: async (target) => calls.push(`play:${target.uuid}`),
    pause: async (target) => calls.push(`pause:${target.uuid}`),
    stop: async (target) => calls.push(`stop:${target.uuid}`),
    seek: async (target, seconds) =>
      calls.push(`seek:${target.uuid}:${seconds}`),
    setVolume: async (target, volume) => {
      calls.push(`volume:${target.uuid}:${volume}`);
      if (options.setVolumeError) throw options.setVolumeError;
    },
    readTransport: async () => ({
      state: transportState,
      status: "OK",
      speed: "1",
    }),
    readPosition: async () => ({
      track: 1,
      durationSeconds: currentDuration,
      positionSeconds: currentPosition,
      uri: currentUri,
      title: null,
      creator: null,
      album: null,
      artworkUrl: null,
    }),
    readVolume: async () => 35,
  };
  const config = decodeConfig({
    sonos: {
      enabled: true,
      lanStreamBaseUrl: "http://192.168.1.243:8765",
      pollIntervalMs: 1000,
      discoveryIntervalSeconds: 30,
    },
  }).sonos;
  const lanStreamBaseUrl = config.lanStreamBaseUrl;
  if (!lanStreamBaseUrl) throw new Error("test Sonos LAN URL missing");
  const coordinator = makeSonosPlaybackCoordinator({
    config,
    outputState: async () => output,
    subscribeOutput: () => () => undefined,
    topology: async () => currentTopology,
    player,
    protocol,
    now: () => clock,
  });
  return {
    coordinator,
    calls,
    expectedUri: () => buildSonosStreamUrl(lanStreamBaseUrl, "ytmusic:track"),
    setUri: (uri: string | null) => {
      currentUri = uri;
    },
    setTransport: (value: string) => {
      transportState = value;
    },
    setPosition: (value: number) => {
      currentPosition = value;
    },
    setDuration: (value: number) => {
      currentDuration = value;
    },
    setTopology: (value: SonosTopology) => {
      currentTopology = value;
    },
    setOutput: (value: ApiPlaybackOutputState) => {
      output = value;
    },
    setClock: (value: number) => {
      clock = value;
    },
    getState: () => playerState,
  };
}

async function preparePhysicalPoll(test: ReturnType<typeof harness>) {
  await test.coordinator.requestRealize();
  test.calls.length = 0;
  test.setClock(5000);
  test.setUri(test.expectedUri());
  await test.coordinator.pollNow();
}

describe("Sonos playback coordinator", () => {
  it("builds an absolute MP3 LAN stream URL", () => {
    expect(
      buildSonosStreamUrl(
        "http://192.168.1.243:8765",
        "ytmusic:a/b",
        "ytmusic:next",
      ),
    ).toBe(
      "http://192.168.1.243:8765/stream/ytmusic%3Aa%2Fb?next=ytmusic%3Anext&format=mp3",
    );
  });

  it("loads metadata, seeks, sets volume, and plays on the current coordinator", async () => {
    const test = harness();
    await test.coordinator.requestRealize();
    expect(test.calls).toEqual([
      "volume:COORD:35",
      "setUri:COORD",
      "seek:COORD:10",
      "play:COORD",
    ]);
  });

  it("does not push volume when no track is loaded", async () => {
    const test = harness({
      initialState: state({ status: "stopped", currentTrack: null }),
    });
    await test.coordinator.requestRealize();
    expect(test.calls).toEqual(["stop:COORD"]);
  });

  it("sets volume even when loading the current track fails", async () => {
    const test = harness({ setUriError: new Error("load failed") });
    await test.coordinator.requestRealize();
    expect(test.calls).toEqual(["volume:COORD:35", "setUri:COORD"]);
  });

  it("loads the current track even when setting volume fails", async () => {
    const test = harness({ setVolumeError: new Error("volume failed") });
    await test.coordinator.requestRealize();
    expect(test.calls).toEqual([
      "volume:COORD:35",
      "setUri:COORD",
      "seek:COORD:10",
      "play:COORD",
    ]);
  });

  it("mirrors physical pause and progress for a recognized Pyxis stream", async () => {
    const test = harness({ transportState: "PAUSED_PLAYBACK", position: 22 });
    await preparePhysicalPoll(test);
    expect(test.calls).toContain("canonical:progress:22");
    expect(test.calls).toContain("canonical:pause");
    expect(test.getState().status).toBe("paused");
  });

  it("advances a naturally ended track exactly once", async () => {
    const test = harness({ transportState: "STOPPED", position: 120 });
    await preparePhysicalPoll(test);
    test.setClock(8000);
    await test.coordinator.pollNow();
    expect(
      test.calls.filter((call) => call.startsWith("canonical:ended")),
    ).toEqual(["canonical:ended:ytmusic:track"]);
  });

  it("detects EOF from a playing-to-stopped transition when Sonos omits duration", async () => {
    const test = harness({
      transportState: "PLAYING",
      position: 10,
      duration: 0,
    });
    await test.coordinator.requestRealize();
    test.setClock(5000);
    test.setUri(test.expectedUri());
    await test.coordinator.pollNow();
    test.setTransport("STOPPED");
    test.setPosition(0);
    test.setClock(8000);
    await test.coordinator.pollNow();
    expect(test.calls).toContain("canonical:ended:ytmusic:track");
  });

  it("realizes the next canonical track after a natural end", async () => {
    const initialTrack = state().currentTrack;
    if (!initialTrack) throw new Error("test track missing");
    const next = {
      ...initialTrack,
      id: "ytmusic:next",
      title: "Next",
    };
    const test = harness({
      initialState: state({ nextTrack: next }),
      transportState: "STOPPED",
      position: 120,
    });
    await test.coordinator.requestRealize();
    test.calls.length = 0;
    test.setClock(5000);
    test.setUri(
      buildSonosStreamUrl(
        "http://192.168.1.243:8765",
        "ytmusic:track",
        "ytmusic:next",
      ),
    );
    await test.coordinator.pollNow();
    expect(test.calls).toContain("canonical:ended:ytmusic:track");
    expect(test.calls).toContain("setUri:COORD");
    expect(test.getState().currentTrack?.id).toBe("ytmusic:next");
  });

  it("marks unknown external media interrupted without clearing the queue", async () => {
    const test = harness();
    await test.coordinator.requestRealize();
    test.calls.length = 0;
    test.setUri("http://radio.example/live.mp3");
    test.setClock(5000);
    await test.coordinator.pollNow();
    expect(test.calls).toContain("canonical:pause");
    expect(test.calls).toContain("canonical:interrupted:ytmusic:track");
    expect(test.getState().currentTrack?.id).toBe("ytmusic:track");
  });

  it("stops the previous Sonos coordinator when output moves to a browser", async () => {
    const test = harness();
    await test.coordinator.requestRealize();
    test.calls.length = 0;
    test.setOutput({ type: "browser", clientId: "browser-1", updatedAt: 2 });
    await test.coordinator.requestRealize();
    expect(test.calls).toEqual(["stop:COORD"]);
  });

  it("retains degraded selection and does not command a missing anchor", async () => {
    const test = harness({ topology: topology(coordinatorRoom, false) });
    await test.coordinator.requestRealize();
    expect(test.calls).toEqual([]);
  });

  it("moves realization to a coordinator changed in the Sonos app", async () => {
    const test = harness();
    await test.coordinator.requestRealize();
    test.calls.length = 0;
    test.setTopology(topology(movedCoordinator));
    test.setClock(40_000);
    await test.coordinator.requestRealize();
    expect(test.calls.slice(0, 2)).toEqual(["volume:MOVED:35", "setUri:MOVED"]);
  });
});
