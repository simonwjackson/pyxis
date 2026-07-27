import type { AppConfig } from "@shared/config.js";
import { Context, Effect, Layer } from "effect";
import { getAppConfig } from "../../services/sourceManager.js";
import {
  discoverSonosTopology,
  type SonosDiscoveryDeps,
} from "../../sonos/discovery.js";
import type { SonosTopology } from "../../sonos/model.js";
import { SourceUnavailable } from "../errors.js";

export type SonosShape = {
  readonly getTopology: Effect.Effect<SonosTopology, SourceUnavailable>;
  readonly refresh: Effect.Effect<SonosTopology, SourceUnavailable>;
};

export class Sonos extends Context.Service<Sonos, SonosShape>()(
  "Pyxis/Sonos",
) {}

export function makeSonosShape(
  config: AppConfig["sonos"],
  deps: SonosDiscoveryDeps = {},
): SonosShape {
  let cached: SonosTopology | undefined;
  let refreshPromise: Promise<SonosTopology> | undefined;

  const refresh = Effect.tryPromise({
    try: () => {
      if (!refreshPromise) {
        refreshPromise = discoverSonosTopology(config, deps).finally(() => {
          refreshPromise = undefined;
        });
      }
      return refreshPromise.then((topology) => {
        cached = topology;
        return topology;
      });
    },
    catch: () =>
      new SourceUnavailable({ code: "sonos_discovery_failed" }),
  });

  return {
    refresh,
    getTopology: Effect.suspend(() => {
      const maxAgeMs = config.discoveryIntervalSeconds * 1000;
      const isFresh =
        cached?.refreshedAt !== null &&
        cached?.refreshedAt !== undefined &&
        (deps.now ?? Date.now)() - cached.refreshedAt < maxAgeMs;
      return isFresh && cached !== undefined
        ? Effect.succeed(cached)
        : refresh;
    }),
  };
}

export function SonosLayerFromConfig(
  config: AppConfig["sonos"],
  deps: SonosDiscoveryDeps = {},
): Layer.Layer<Sonos> {
  return Layer.sync(Sonos)(() => makeSonosShape(config, deps));
}

export const SonosLayerLive: Layer.Layer<Sonos> = Layer.sync(Sonos)(() => {
  const config = getAppConfig()?.sonos;
  return makeSonosShape(
    config ?? {
      enabled: false,
      lanStreamBaseUrl: undefined,
      seedHosts: [],
      discoveryIntervalSeconds: 30,
      pollIntervalMs: 1000,
      requestTimeoutMs: 3000,
    },
  );
});
