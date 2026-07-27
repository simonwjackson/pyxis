import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { sonosHandlers } from "./sonos.js";

describe("Sonos RPC handlers", () => {
  it("returns the public topology projection", async () => {
    const handlers = sonosHandlers({
      sonos: {
        getTopology: Effect.succeed({
          enabled: true,
          available: true,
          refreshedAt: 123,
          groups: [
            {
              id: "group-1",
              coordinatorUuid: "RINCON_KITCHEN",
              coordinatorName: "Kitchen",
              rooms: [
                {
                  uuid: "RINCON_KITCHEN",
                  name: "Kitchen",
                  model: "SYMFONISK",
                  address: "192.168.1.241",
                  locationUrl:
                    "http://192.168.1.241:1400/xml/device_description.xml",
                  isCoordinator: true,
                },
              ],
            },
          ],
        }),
        refresh: Effect.die("not used"),
      },
    });

    const result = await Effect.runPromise(handlers["sonos.topology.get"]());
    expect(result.groups[0]?.rooms[0]).toEqual({
      uuid: "RINCON_KITCHEN",
      name: "Kitchen",
      model: "SYMFONISK",
      address: "192.168.1.241",
      isCoordinator: true,
    });
  });
});
