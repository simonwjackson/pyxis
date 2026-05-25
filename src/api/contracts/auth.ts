import { Schema } from "effect";

export const AuthStatusSchema = Schema.Struct({
	authenticated: Schema.Boolean,
});

export const SettingsSchema = Schema.Struct({
	isExplicitContentFilterEnabled: Schema.optionalKey(Schema.Boolean),
	isProfilePrivate: Schema.optionalKey(Schema.Boolean),
	zipCode: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(16))),
});
