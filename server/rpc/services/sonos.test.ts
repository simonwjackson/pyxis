import { describe, expect, it } from "bun:test";
import { decodeConfig } from "@shared/config.js";
import { Effect } from "effect";
import { makeSonosShape } from "./sonos.js";

describe("Sonos service", () => {
  it("returns disabled topology without network discovery", async () => {
    let calls = 0;
    const sonos = makeSonosShape(decodeConfig({}).sonos, {
      discoverLocations: async () => {
        calls += 1;
        return [];
      },
    });

    const topology = await Effect.runPromise(sonos.getTopology);
    expect(topology.enabled).toBe(false);
    expect(calls).toBe(0);
  });

  it("caches topology for the configured discovery interval", async () => {
    let calls = 0;
    let now = 100;
    const sonos = makeSonosShape(
      decodeConfig({
        sonos: {
          enabled: true,
          seedHosts: [],
          discoveryIntervalSeconds: 30,
        },
      }).sonos,
      {
        now: () => now,
        discoverLocations: async () => {
          calls += 1;
          return [];
        },
      },
    );

    await Effect.runPromise(sonos.getTopology);
    now += 10_000;
    await Effect.runPromise(sonos.getTopology);
    expect(calls).toBe(1);

    now += 30_000;
    await Effect.runPromise(sonos.getTopology);
    expect(calls).toBe(2);
  });
});
