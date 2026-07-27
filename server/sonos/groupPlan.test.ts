import { describe, expect, it } from "bun:test";
import type { SonosRoom, SonosTopology } from "./model.js";
import { planSonosGroupUpdate } from "./groupPlan.js";

function room(uuid: string, name: string, isCoordinator: boolean): SonosRoom {
  return {
    uuid,
    name,
    model: null,
    address: `192.168.1.${uuid.charCodeAt(0)}`,
    locationUrl: `http://192.168.1.${uuid.charCodeAt(0)}:1400/xml/device_description.xml`,
    isCoordinator,
  };
}

const a = room("A", "Alpha", true);
const b = room("B", "Beta", false);
const c = room("C", "Charlie", false);
const d = room("D", "Delta", true);
const topology: SonosTopology = {
  enabled: true,
  available: true,
  refreshedAt: 1,
  groups: [
    {
      id: "group-a",
      coordinatorUuid: "A",
      coordinatorName: "Alpha",
      rooms: [a, b, c],
    },
    {
      id: "group-d",
      coordinatorUuid: "D",
      coordinatorName: "Delta",
      rooms: [d],
    },
  ],
};

describe("Sonos group update planning", () => {
  it("ungroups excluded rooms before joining new rooms", () => {
    expect(planSonosGroupUpdate(topology, "A", ["A", "B", "D"])).toEqual([
      { type: "leave", room: c },
      { type: "join", room: d, coordinatorUuid: "A" },
    ]);
  });

  it("can promote an existing member to coordinator", () => {
    expect(planSonosGroupUpdate(topology, "B", ["B", "C"])).toEqual([
      { type: "leave", room: b },
      { type: "join", room: c, coordinatorUuid: "B" },
    ]);
  });

  it("requires the coordinator in the desired members", () => {
    expect(() => planSonosGroupUpdate(topology, "A", ["B"])).toThrow(
      "coordinator must be included",
    );
  });
});
