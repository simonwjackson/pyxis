/**
 * @module server/rpc/handlers/radio tests
 * Handler glue tests for the `radio.*` family. Pandora station behavior is
 * covered by the Radio service tests; these assert the handler layer delegates
 * payloads and preserves typed public failures through `publicHandler`.
 */

import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { Unauthorized } from "../errors.js";
import type { RadioShape } from "../services/radio.js";
import { radioHandlers } from "./radio.js";

function makeRadio(overrides: Partial<RadioShape> = {}): RadioShape {
  return {
    listStations: () =>
      Effect.succeed([
        {
          id: "pandora:tok1",
          stationId: "pandora:sid1",
          name: "Indie",
          isQuickMix: false,
          quickMixStationIds: [],
          allowDelete: false,
          allowRename: false,
        },
      ]),
    getStation: () =>
      Effect.succeed({
        id: "pandora:tok1",
        stationId: "pandora:sid1",
        name: "Indie",
      }),
    getStationTracks: () => Effect.succeed([]),
    createStation: () =>
      Effect.succeed({
        id: "pandora:tok1",
        stationId: "pandora:sid1",
        name: "Indie",
      }),
    deleteStation: () => Effect.succeed({ success: true as const }),
    renameStation: () =>
      Effect.succeed({
        id: "pandora:tok1",
        stationId: "pandora:sid1",
        name: "Renamed",
      }),
    listGenres: () => Effect.succeed([]),
    setQuickMix: () => Effect.succeed({ success: true as const }),
    addSeed: () => Effect.succeed({ seedId: "pandora:seed-1" }),
    removeSeed: () => Effect.succeed({ success: true as const }),
    ...overrides,
  };
}

describe("radio handlers", () => {
  it("radio.stations.list returns the service station summaries", async () => {
    const handlers = radioHandlers({ radio: makeRadio() });
    const result = await Effect.runPromise(handlers["radio.stations.list"]());

    expect(result).toEqual([
      {
        id: "pandora:tok1",
        stationId: "pandora:sid1",
        name: "Indie",
        isQuickMix: false,
        quickMixStationIds: [],
        allowDelete: false,
        allowRename: false,
      },
    ]);
  });

  it("radio.station.get passes the payload through to the service", async () => {
    let seenId = "";
    const handlers = radioHandlers({
      radio: makeRadio({
        getStation: (input) => {
          seenId = input.id;
          return Effect.succeed({
            id: input.id,
            stationId: "pandora:sid1",
            name: "Indie",
          });
        },
      }),
    });

    const result = await Effect.runPromise(
      handlers["radio.station.get"]({ id: "pandora:tok1" }),
    );

    expect(seenId).toBe("pandora:tok1");
    expect(result.id).toBe("pandora:tok1");
  });

  it("state-changing commands return typed service envelopes", async () => {
    const handlers = radioHandlers({ radio: makeRadio() });

    await expect(
      Effect.runPromise(
        handlers["radio.station.delete"]({ id: "pandora:tok1" }),
      ),
    ).resolves.toEqual({ success: true });
    await expect(
      Effect.runPromise(
        handlers["radio.quickMix.set"]({ radioIds: ["pandora:tok1"] }),
      ),
    ).resolves.toEqual({ success: true });
    await expect(
      Effect.runPromise(
        handlers["radio.seed.add"]({
          radioId: "pandora:tok1",
          musicToken: "music-token",
        }),
      ),
    ).resolves.toEqual({ seedId: "pandora:seed-1" });
  });

  it("maps typed service failures through the public error boundary", async () => {
    const handlers = radioHandlers({
      radio: makeRadio({
        listStations: () =>
          Effect.fail(
            new Unauthorized({ code: "pandora_credentials_required" }),
          ),
      }),
    });

    const exit = await Effect.runPromise(
      Effect.exit(handlers["radio.stations.list"]()),
    );

    expect(JSON.stringify(exit)).toContain("Unauthorized");
  });
});
