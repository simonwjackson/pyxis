import { Schema } from "effect";
import { ClientAuthorizationSchema } from "./clientMode.js";

const StableIdSchema = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(200),
);

export const PlaybackOutputStateSchema = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("none"),
    updatedAt: Schema.Number,
  }),
  Schema.Struct({
    type: Schema.Literal("browser"),
    clientId: StableIdSchema,
    updatedAt: Schema.Number,
  }),
  Schema.Struct({
    type: Schema.Literal("sonos"),
    roomUuid: StableIdSchema,
    roomName: Schema.Union([Schema.String, Schema.Null]),
    coordinatorUuid: Schema.Union([StableIdSchema, Schema.Null]),
    coordinatorName: Schema.Union([Schema.String, Schema.Null]),
    available: Schema.Boolean,
    updatedAt: Schema.Number,
  }),
]);
export type ApiPlaybackOutputState = Schema.Schema.Type<
  typeof PlaybackOutputStateSchema
>;

export const SelectBrowserOutputInputSchema = Schema.Struct({
  clientId: StableIdSchema,
  authorization: ClientAuthorizationSchema,
});
export type ApiSelectBrowserOutputInput = Schema.Schema.Type<
  typeof SelectBrowserOutputInputSchema
>;

export const SelectSonosOutputInputSchema = Schema.Struct({
  roomUuid: StableIdSchema,
});
export type ApiSelectSonosOutputInput = Schema.Schema.Type<
  typeof SelectSonosOutputInputSchema
>;
