import { describe, expect, it } from "bun:test";
import { Schema } from "effect";
import {
	AuthStatusSchema,
	ChangeSettingsInputSchema,
	SetExplicitFilterInputSchema,
	SettingsSchema,
	UsageInfoSchema,
} from "./auth.js";

describe("auth API contracts", () => {
	it("preserves the authenticated + hasPandora status wire shape", () => {
		expect(
			Schema.decodeUnknownSync(AuthStatusSchema)({
				authenticated: true,
				hasPandora: false,
			}),
		).toEqual({ authenticated: true, hasPandora: false });
	});

	it("rejects auth status without explicit hasPandora flag", () => {
		expect(() =>
			Schema.decodeUnknownSync(AuthStatusSchema)({ authenticated: true }),
		).toThrow();
	});

	it("decodes Pandora settings with known UI fields and drops unknown extras", () => {
		const decoded = Schema.decodeUnknownSync(SettingsSchema)({
			isExplicitContentFilterEnabled: true,
			isProfilePrivate: false,
			zipCode: "00000",
			emailOptIn: true,
			internalRawCause: "/home/user/secret-path",
		});
		expect(decoded.isExplicitContentFilterEnabled).toBe(true);
		expect(decoded.zipCode).toBe("00000");
		expect(decoded).not.toHaveProperty("internalRawCause");
	});

	it("rejects oversize zip codes in settings and change input", () => {
		expect(() =>
			Schema.decodeUnknownSync(SettingsSchema)({ zipCode: "x".repeat(17) }),
		).toThrow();
		expect(() =>
			Schema.decodeUnknownSync(ChangeSettingsInputSchema)({
				zipCode: "x".repeat(17),
			}),
		).toThrow();
	});

	it("accepts empty change settings payload", () => {
		expect(Schema.decodeUnknownSync(ChangeSettingsInputSchema)({})).toEqual({});
	});

	it("requires a boolean explicit filter flag", () => {
		expect(
			Schema.decodeUnknownSync(SetExplicitFilterInputSchema)({ enabled: true }),
		).toEqual({ enabled: true });
		expect(() =>
			Schema.decodeUnknownSync(SetExplicitFilterInputSchema)({
				enabled: "yes",
			}),
		).toThrow();
	});

	it("decodes usage info as a primitive-valued record", () => {
		const decoded = Schema.decodeUnknownSync(UsageInfoSchema)({
			accountMonthlyListening: 1234,
			displayUsage: true,
			label: "free",
			lastListeningDate: null,
		});
		expect(decoded.accountMonthlyListening).toBe(1234);
		expect(decoded.lastListeningDate).toBeNull();
	});

	it("rejects nested objects in usage info to keep it primitive-only", () => {
		expect(() =>
			Schema.decodeUnknownSync(UsageInfoSchema)({ nested: { evil: true } }),
		).toThrow();
	});
});
