import { describe, expect, it } from "bun:test";
import { decodeConfig } from "@shared/config.js";
import { Effect } from "effect";
import {
  makeSonosShape,
  sonosGroupMatches,
  sonosRoomIsStandalone,
} from "./sonos.js";

describe("Sonos service", () => {
  it("verifies exact group membership before reporting mutation success", () => {
    const grouped = {
      enabled: true,
      available: true,
      refreshedAt: 1,
      groups: [
        {
          id: "g",
          coordinatorUuid: "A",
          coordinatorName: "A",
          rooms: [
            {
              uuid: "A",
              name: "A",
              model: null,
              address: "1",
              locationUrl: "http://192.168.1.1:1400/xml/device_description.xml",
              isCoordinator: true,
            },
            {
              uuid: "B",
              name: "B",
              model: null,
              address: "2",
              locationUrl: "http://192.168.1.2:1400/xml/device_description.xml",
              isCoordinator: false,
            },
          ],
        },
      ],
    } as const;
    expect(sonosGroupMatches(grouped, "A", ["A", "B"])).toBe(true);
    expect(sonosGroupMatches(grouped, "A", ["A"])).toBe(false);
    expect(sonosRoomIsStandalone(grouped, "A")).toBe(false);
  });

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
