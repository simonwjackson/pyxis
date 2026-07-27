import { Schema } from "effect";

export const ClientModeSchema = Schema.Literals(["player", "console"]);
export type ApiClientMode = Schema.Schema.Type<typeof ClientModeSchema>;

export const ClientAuthorizationSchema = Schema.String.check(
  Schema.isMinLength(20),
  Schema.isMaxLength(2048),
);

export const ClientModeAuthorizationSchema = Schema.Struct({
  mode: ClientModeSchema,
  authorization: ClientAuthorizationSchema,
});
export type ApiClientModeAuthorization = Schema.Schema.Type<
  typeof ClientModeAuthorizationSchema
>;
