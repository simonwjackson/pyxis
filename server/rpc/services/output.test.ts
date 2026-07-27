import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import type { SonosShape } from "./sonos.js";
import { SourceUnavailable } from "../errors.js";
import { makeOutputShape } from "./output.js";

const topology = {
  enabled: true,
  available: true,
  refreshedAt: 1,
  groups: [
    {
      id: "group-1",
      coordinatorUuid: "RINCON_KITCHEN",
      coordinatorName: "Kitchen",
      rooms: [
        {
          uuid: "RINCON_BASEMENT",
          name: "Basement",
          model: null,
          address: "192.168.1.118",
          locationUrl:
            "http://192.168.1.118:1400/xml/device_description.xml",
          isCoordinator: false,
        },
        {
          uuid: "RINCON_KITCHEN",
          name: "Kitchen",
          model: null,
          address: "192.168.1.241",
          locationUrl:
            "http://192.168.1.241:1400/xml/device_description.xml",
          isCoordinator: true,
        },
      ],
    },
  ],
} as const;

function sonos(getTopology: SonosShape["getTopology"]): SonosShape {
  return {
    getTopology,
    refresh: getTopology,
    updateGroup: () => getTopology,
    ungroupRoom: () => getTopology,
  };
}

describe("shared playback output service", () => {
  it("persists one browser owner and gates browser reports", async () => {
    const saved: unknown[] = [];
    const output = makeOutputShape(sonos(Effect.succeed(topology)), {
      now: () => 123,
      save: (selection) => saved.push(selection),
    });
    await Effect.runPromise(output.selectBrowser({ clientId: "client_alpha" }));
    expect(await Effect.runPromise(output.acceptsBrowserReport("client_alpha"))).toBe(
      true,
    );
    expect(await Effect.runPromise(output.acceptsBrowserReport("client_beta"))).toBe(
      false,
    );
    expect(saved).toEqual([
      { type: "browser", clientId: "client_alpha", updatedAt: 123 },
    ]);
  });

  it("anchors Sonos selection to a room and resolves its current coordinator", async () => {
    const output = makeOutputShape(sonos(Effect.succeed(topology)), {
      now: () => 456,
      save: () => undefined,
    });
    const state = await Effect.runPromise(
      output.selectSonos({ roomUuid: "RINCON_BASEMENT" }),
    );
    expect(state).toMatchObject({
      type: "sonos",
      roomUuid: "RINCON_BASEMENT",
      coordinatorUuid: "RINCON_KITCHEN",
      available: true,
    });
  });

  it("keeps a persisted Sonos selection when discovery is unavailable", async () => {
    const output = makeOutputShape(
      sonos(
        Effect.fail(
          new SourceUnavailable({ code: "sonos_discovery_failed" }),
        ),
      ),
      {
        initialSelection: {
          type: "sonos",
          roomUuid: "RINCON_BASEMENT",
          updatedAt: 789,
        },
      },
    );
    expect(await Effect.runPromise(output.getState)).toEqual({
      type: "sonos",
      roomUuid: "RINCON_BASEMENT",
      roomName: null,
      coordinatorUuid: null,
      coordinatorName: null,
      available: false,
      updatedAt: 789,
    });
  });
});
