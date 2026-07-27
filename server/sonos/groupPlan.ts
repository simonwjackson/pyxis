import type { SonosGroup, SonosRoom, SonosTopology } from "./model.js";

export type SonosGroupOperation =
  | { readonly type: "leave"; readonly room: SonosRoom }
  | {
      readonly type: "join";
      readonly room: SonosRoom;
      readonly coordinatorUuid: string;
    };

function findGroupForRoom(
  topology: SonosTopology,
  roomUuid: string,
): SonosGroup | undefined {
  return topology.groups.find((group) =>
    group.rooms.some((room) => room.uuid === roomUuid),
  );
}

export function planSonosGroupUpdate(
  topology: SonosTopology,
  coordinatorUuid: string,
  memberUuids: readonly string[],
): readonly SonosGroupOperation[] {
  const desired = new Set(memberUuids);
  if (!desired.has(coordinatorUuid)) {
    throw new Error("The Sonos coordinator must be included in its group");
  }
  const allRooms = new Map(
    topology.groups.flatMap((group) =>
      group.rooms.map((room) => [room.uuid, room] as const),
    ),
  );
  const coordinator = allRooms.get(coordinatorUuid);
  if (!coordinator) throw new Error("The Sonos coordinator was not found");
  for (const uuid of desired) {
    if (!allRooms.has(uuid)) throw new Error(`Sonos room was not found: ${uuid}`);
  }

  const leaves = new Map<string, SonosRoom>();
  const coordinatorGroup = findGroupForRoom(topology, coordinatorUuid);
  if (coordinatorGroup?.coordinatorUuid !== coordinatorUuid) {
    leaves.set(coordinatorUuid, coordinator);
  } else if (coordinatorGroup) {
    for (const room of coordinatorGroup.rooms) {
      if (!desired.has(room.uuid)) leaves.set(room.uuid, room);
    }
  }

  for (const uuid of desired) {
    if (uuid === coordinatorUuid) continue;
    const group = findGroupForRoom(topology, uuid);
    if (group?.coordinatorUuid === uuid) {
      for (const room of group.rooms) {
        if (!desired.has(room.uuid)) leaves.set(room.uuid, room);
      }
    }
  }

  const joins: SonosGroupOperation[] = [];
  for (const uuid of desired) {
    if (uuid === coordinatorUuid) continue;
    const room = allRooms.get(uuid);
    const group = findGroupForRoom(topology, uuid);
    if (room && group?.coordinatorUuid !== coordinatorUuid) {
      joins.push({ type: "join", room, coordinatorUuid });
    }
  }

  return [
    ...[...leaves.values()].map(
      (room): SonosGroupOperation => ({ type: "leave", room }),
    ),
    ...joins,
  ];
}
