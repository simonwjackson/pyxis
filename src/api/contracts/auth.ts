import { Schema } from "effect";

export const AuthStatusSchema = Schema.Struct({
	authenticated: Schema.Boolean,
	hasPandora: Schema.Boolean,
});
export type ApiAuthStatus = Schema.Schema.Type<typeof AuthStatusSchema>;

/**
 * Pandora user settings response. The upstream payload is large and partially
 * documented; the contract pins the fields the UI actually reads and lets the
 * remaining wire data pass through as opaque values. Effect Schema strips
 * unknown fields by default, so the explicit known keys document the
 * UI-facing surface even when the upstream payload carries more.
 */
export const SettingsSchema = Schema.Struct({
	isExplicitContentFilterEnabled: Schema.optionalKey(Schema.Boolean),
	isExplicitContentFilterPINProtected: Schema.optionalKey(Schema.Boolean),
	isProfilePrivate: Schema.optionalKey(Schema.Boolean),
	zipCode: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(16))),
	birthYear: Schema.optionalKey(Schema.Number),
	gender: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(32))),
	username: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(256))),
	emailOptIn: Schema.optionalKey(Schema.Boolean),
});
export type ApiSettings = Schema.Schema.Type<typeof SettingsSchema>;

export const ChangeSettingsInputSchema = Schema.Struct({
	isExplicitContentFilterEnabled: Schema.optionalKey(Schema.Boolean),
	isProfilePrivate: Schema.optionalKey(Schema.Boolean),
	zipCode: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(16))),
});
export type ApiChangeSettingsInput = Schema.Schema.Type<
	typeof ChangeSettingsInputSchema
>;

export const SetExplicitFilterInputSchema = Schema.Struct({
	enabled: Schema.Boolean,
});
export type ApiSetExplicitFilterInput = Schema.Schema.Type<
	typeof SetExplicitFilterInputSchema
>;

/**
 * Pandora `getUsageInfo` returns implementation-defined keys that the UI
 * surfaces as informational labels. Bound the wire to a string-keyed map of
 * primitive values rather than encoding every upstream field.
 */
export const UsageInfoSchema = Schema.Record(
	Schema.String,
	Schema.Union([Schema.String, Schema.Number, Schema.Boolean, Schema.Null]),
);
export type ApiUsageInfo = Schema.Schema.Type<typeof UsageInfoSchema>;
