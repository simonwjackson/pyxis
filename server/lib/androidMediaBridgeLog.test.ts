import { describe, expect, it } from "bun:test";
import { parseNativeBridgeLogPayload } from "./androidMediaBridgeLog.js";

describe("parseNativeBridgeLogPayload", () => {
	it("accepts a bounded allowlisted native event", () => {
		const parsed = parseNativeBridgeLogPayload({
			event: "command_sent",
			level: "info",
			message: "pause requested",
			correlationId: "abc",
			fields: { action: "pause" },
		});

		expect(parsed.ok).toBe(true);
		if (parsed.ok) expect(parsed.value.event).toBe("command_sent");
	});

	it("rejects unknown fields and events", () => {
		expect(parseNativeBridgeLogPayload({ event: "launch_settings" }).ok).toBe(false);
		expect(parseNativeBridgeLogPayload({ event: "command_sent", extra: "nope" }).ok).toBe(false);
	});

	it("redacts token and URL-shaped field values", () => {
		const parsed = parseNativeBridgeLogPayload({
			event: "bridge_state_received",
			fields: {
				url: "http://192.168.1.243:8765/stream/ytmusic:secret",
				token: "super-secret-token",
			},
		});

		expect(parsed.ok).toBe(true);
		if (parsed.ok) {
			expect(parsed.value.fields?.["url"]).toBe("[redacted]");
			expect(parsed.value.fields?.["token"]).toBe("[redacted]");
		}
	});
});
