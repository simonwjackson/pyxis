import { Schema } from "effect";
import { ClientLogMessageSchema } from "./common.js";

export const ClientLogInputSchema = Schema.Struct({
  message: ClientLogMessageSchema,
});
export type ApiClientLogInput = Schema.Schema.Type<typeof ClientLogInputSchema>;
