import type { AppConfig } from "@shared/config.js";
import { Context, Effect, Layer } from "effect";
import { getAppConfig } from "../../services/sourceManager.js";
import {
  makeSonosPlaybackCoordinator,
  type SonosPlaybackCoordinator,
} from "../../sonos/playback.js";
import { Output } from "./output.js";
import { Player } from "./player.js";
import { Sonos } from "./sonos.js";

export class SonosPlayback extends Context.Service<
  SonosPlayback,
  SonosPlaybackCoordinator
>()("Pyxis/SonosPlayback") {}

const disabledConfig: AppConfig["sonos"] = {
  enabled: false,
  lanStreamBaseUrl: undefined,
  seedHosts: [],
  discoveryIntervalSeconds: 30,
  pollIntervalMs: 1000,
  requestTimeoutMs: 3000,
};

export const SonosPlaybackLayerLive: Layer.Layer<
  SonosPlayback,
  never,
  Sonos | Output | Player
> = Layer.effect(
  SonosPlayback,
  Effect.gen(function* () {
    const sonos = yield* Sonos;
    const output = yield* Output;
    const player = yield* Player;
    const config = getAppConfig()?.sonos ?? disabledConfig;
    const coordinator = makeSonosPlaybackCoordinator({
      config,
      outputState: () => Effect.runPromise(output.getState),
      subscribeOutput: (listener) => Effect.runSync(output.subscribe(listener)),
      topology: (refresh) =>
        Effect.runPromise(refresh ? sonos.refresh : sonos.getTopology),
      player: {
        getState: () => Effect.runPromise(player.getState),
        pause: () => Effect.runPromise(player.pause),
        resume: () => Effect.runPromise(player.resume),
        setDuration: (seconds, trackId) =>
          Effect.runPromise(player.setDuration(seconds, trackId)),
        reportProgress: (seconds, trackId) =>
          Effect.runPromise(player.reportProgress(seconds, trackId)),
        setVolume: (volume) => Effect.runPromise(player.setVolume(volume)),
        trackEnded: (trackId) => Effect.runPromise(player.trackEnded(trackId)),
        reportInterrupted: (trackId) =>
          Effect.runPromise(
            player.reportAudioError(
              "Sonos playback was interrupted by external media",
              trackId,
            ),
          ),
        subscribe: (listener) =>
          Effect.runSync(player.subscribe(() => listener())),
      },
    });
    coordinator.start();
    yield* Effect.addFinalizer(() => Effect.sync(() => coordinator.stop()));
    return coordinator;
  }),
);
