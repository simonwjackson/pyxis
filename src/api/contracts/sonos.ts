import { Schema } from "effect";

const NonEmptyString = Schema.String.check(Schema.isMinLength(1));

export const SonosRoomSchema = Schema.Struct({
  uuid: NonEmptyString,
  name: NonEmptyString,
  model: Schema.Union([Schema.String, Schema.Null]),
  address: NonEmptyString,
  isCoordinator: Schema.Boolean,
});
export type ApiSonosRoom = Schema.Schema.Type<typeof SonosRoomSchema>;

export const SonosGroupSchema = Schema.Struct({
  id: NonEmptyString,
  coordinatorUuid: NonEmptyString,
  coordinatorName: NonEmptyString,
  rooms: Schema.Array(SonosRoomSchema),
});
export type ApiSonosGroup = Schema.Schema.Type<typeof SonosGroupSchema>;

export const SonosTopologySchema = Schema.Struct({
  enabled: Schema.Boolean,
  available: Schema.Boolean,
  groups: Schema.Array(SonosGroupSchema),
  refreshedAt: Schema.Union([Schema.Number, Schema.Null]),
});
export type ApiSonosTopology = Schema.Schema.Type<typeof SonosTopologySchema>;

export const SonosGroupUpdateInputSchema = Schema.Struct({
  coordinatorUuid: NonEmptyString,
  memberUuids: Schema.Array(NonEmptyString).check(
    Schema.makeFilter((value) =>
      value.length > 0
        ? undefined
        : { path: [], issue: "at least one Sonos room is required" },
    ),
  ),
});
export type ApiSonosGroupUpdateInput = Schema.Schema.Type<
  typeof SonosGroupUpdateInputSchema
>;

export const SonosRoomInputSchema = Schema.Struct({
  roomUuid: NonEmptyString,
});
export type ApiSonosRoomInput = Schema.Schema.Type<
  typeof SonosRoomInputSchema
>;
