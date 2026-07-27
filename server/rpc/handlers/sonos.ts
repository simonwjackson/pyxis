import type { ApiSonosTopology } from "@shared/api/contracts/sonos.js";
import { Effect } from "effect";
import type { SonosTopology } from "../../sonos/model.js";
import { publicHandler } from "../handler.js";
import type { SonosShape } from "../services/sonos.js";

export type SonosHandlerDeps = {
  readonly sonos: SonosShape;
};

export function serializeSonosTopology(
  topology: SonosTopology,
): ApiSonosTopology {
  return {
    enabled: topology.enabled,
    available: topology.available,
    refreshedAt: topology.refreshedAt,
    groups: topology.groups.map((group) => ({
      id: group.id,
      coordinatorUuid: group.coordinatorUuid,
      coordinatorName: group.coordinatorName,
      rooms: group.rooms.map((room) => ({
        uuid: room.uuid,
        name: room.name,
        model: room.model,
        address: room.address,
        isCoordinator: room.isCoordinator,
      })),
    })),
  };
}

export const sonosHandlers = (deps: SonosHandlerDeps) => ({
  "sonos.topology.get": () =>
    publicHandler(
      deps.sonos.getTopology.pipe(Effect.map(serializeSonosTopology)),
    ),
  "sonos.discovery.refresh": () =>
    publicHandler(deps.sonos.refresh.pipe(Effect.map(serializeSonosTopology))),
});
