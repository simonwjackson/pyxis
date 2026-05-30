import { Schema } from "effect";
import { CompositeTrackIdSchema, PaginationInputSchema } from "./common.js";

export const ListenLogInputSchema = PaginationInputSchema;
export type ApiListenLogInput = Schema.Schema.Type<typeof ListenLogInputSchema>;

export const ListenLogEntrySchema = Schema.Struct({
  id: Schema.String,
  compositeId: CompositeTrackIdSchema,
  title: Schema.String,
  artist: Schema.String,
  album: Schema.optionalKey(Schema.String),
  source: Schema.String,
  listenedAt: Schema.Number,
});
export type ApiListenLogEntry = Schema.Schema.Type<typeof ListenLogEntrySchema>;

export const ListenLogResponseSchema = Schema.Array(ListenLogEntrySchema);
export type ApiListenLogResponse = Schema.Schema.Type<
  typeof ListenLogResponseSchema
>;
