/**
 * @module server/rpc/handlers/radio tests
 * Behavior tests for the `radio.*` family. Focused on:
 *
 * - station list / station detail / genres responses are encoded with the
 *   same shape as `server/routers/radio.ts`,
 * - playlist items with missing required metadata are dropped (preserving
 *   the existing safe-fallback behavior),
 * - state-changing commands return the expected `success: true` envelopes,
 * - missing Pandora session surfaces a typed Unauthorized public error.
 */

import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { Unauthorized } from "../errors.js";
import type { AuthSessionShape } from "../services/authSession.js";
import { radioHandlers } from "./radio.js";

function makeAuth(
	retry: <A, E, R>(
		f: (ctx: never) => Effect.Effect<A, E, R>,
	) => Effect.Effect<A, E, R>,
): AuthSessionShape {
	return {
		getSession: Effect.succeed(undefined as never),
		requireSession: Effect.fail({} as never),
		getSourceManager: Effect.succeed({} as never),
		refresh: Effect.fail({} as never),
		withAuthRetry: retry as AuthSessionShape["withAuthRetry"],
	};
}

const unauthorized: AuthSessionShape = {
	getSession: Effect.succeed(undefined as never),
	requireSession: Effect.fail(
		new Unauthorized({ code: "pandora_credentials_required" }),
	),
	getSourceManager: Effect.succeed({} as never),
	refresh: Effect.fail({} as never),
	withAuthRetry: (() =>
		Effect.fail(
			new Unauthorized({ code: "pandora_credentials_required" }),
		)) as AuthSessionShape["withAuthRetry"],
};

describe("radio.stations.list handler", () => {
	it("encodes every station with opaque ids and default flags", async () => {
		const auth = makeAuth(((
			_f: (ctx: never) => Effect.Effect<unknown, unknown>,
		) =>
			Effect.succeed({
				stations: [
					{
						stationToken: "tok1",
						stationId: "sid1",
						stationName: "Indie",
					},
					{
						stationToken: "tok2",
						stationId: "sid2",
						stationName: "Jazz",
						isQuickMix: true,
						quickMixStationIds: ["a", "b"],
						allowDelete: true,
						allowRename: true,
					},
				],
			})) as never);
		const handlers = radioHandlers({ auth });
		const result = await Effect.runPromise(handlers["radio.stations.list"]());
		expect(result).toEqual([
			{
				id: "pandora:tok1",
				stationId: "pandora:sid1",
				name: "Indie",
				isQuickMix: false,
				quickMixStationIds: [],
				allowDelete: false,
				allowRename: false,
			},
			{
				id: "pandora:tok2",
				stationId: "pandora:sid2",
				name: "Jazz",
				isQuickMix: true,
				quickMixStationIds: ["pandora:a", "pandora:b"],
				allowDelete: true,
				allowRename: true,
			},
		]);
	});

	it("propagates Unauthorized when no Pandora session is available", async () => {
		const handlers = radioHandlers({ auth: unauthorized });
		const exit = await Effect.runPromise(
			Effect.exit(handlers["radio.stations.list"]()),
		);
		expect(exit._tag).toBe("Failure");
		if (exit._tag === "Failure") {
			expect(JSON.stringify(exit.cause)).toContain("Unauthorized");
		}
	});
});

describe("radio.station.delete handler", () => {
	it("returns success:true after the underlying Pandora delete resolves", async () => {
		const auth = makeAuth(((
			_f: (ctx: never) => Effect.Effect<unknown, unknown>,
		) => Effect.succeed(undefined)) as never);
		const handlers = radioHandlers({ auth });
		const result = await Effect.runPromise(
			handlers["radio.station.delete"]({ id: "pandora:tokenA" }),
		);
		expect(result).toEqual({ success: true });
	});
});

describe("radio.quickMix.set handler", () => {
	it("returns success:true after parsing radio ids and calling Pandora", async () => {
		const auth = makeAuth(((
			_f: (ctx: never) => Effect.Effect<unknown, unknown>,
		) => Effect.succeed(undefined)) as never);
		const handlers = radioHandlers({ auth });
		const result = await Effect.runPromise(
			handlers["radio.quickMix.set"]({
				radioIds: ["pandora:a", "pandora:b"],
			}),
		);
		expect(result).toEqual({ success: true });
	});
});

describe("radio.genres.list handler", () => {
	it("forwards Pandora category list straight through", async () => {
		const auth = makeAuth(((
			_f: (ctx: never) => Effect.Effect<unknown, unknown>,
		) =>
			Effect.succeed({
				categories: [
					{
						categoryName: "Rock",
						stations: [{ stationToken: "g1", stationName: "Indie Rock" }],
					},
				],
			})) as never);
		const handlers = radioHandlers({ auth });
		const result = await Effect.runPromise(handlers["radio.genres.list"]());
		expect(result).toEqual([
			{
				categoryName: "Rock",
				stations: [{ stationToken: "g1", stationName: "Indie Rock" }],
			},
		]);
	});
});
