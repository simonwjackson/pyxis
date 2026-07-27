import { describe, expect, it } from "bun:test";
import { Schema } from "effect";
import {
  SonosGroupUpdateInputSchema,
  SonosTopologySchema,
} from "./sonos.js";

describe("Sonos contracts", () => {
  it("decodes grouped rooms with one coordinator", () => {
    const topology = Schema.decodeUnknownSync(SonosTopologySchema)({
      enabled: true,
      available: true,
      refreshedAt: 123,
      groups: [
        {
          id: "group-1",
          coordinatorUuid: "RINCON_COORD",
          coordinatorName: "Kitchen",
          rooms: [
            {
              uuid: "RINCON_COORD",
              name: "Kitchen",
              model: "SYMFONISK Bookshelf",
              address: "192.168.1.241",
              isCoordinator: true,
            },
          ],
        },
      ],
    });

    expect(topology.groups[0]?.rooms[0]?.isCoordinator).toBe(true);
  });

  it("requires at least one member when updating a group", () => {
    expect(() =>
      Schema.decodeUnknownSync(SonosGroupUpdateInputSchema)({
        coordinatorUuid: "RINCON_COORD",
        memberUuids: [],
      }),
    ).toThrow();
  });
});
