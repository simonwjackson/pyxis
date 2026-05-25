/**
 * @module server/rpc/services/authSession tests
 * Behavior tests for the AuthSession service.
 *
 * The service centralizes Pandora refresh semantics, so the tests focus on
 * the observable refresh contract: missing credentials, concurrent refresh
 * coalescing, rate-capped failures, retry-on-auth-error wiring, and typed
 * public errors at the RPC boundary.
 */

import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import type { SourceManager } from "../../../src/sources/index.js";
import type { PandoraSession } from "../../../src/sources/pandora/client.js";
import { ApiCallError } from "../../../src/sources/pandora/types/errors.js";
import {
	AuthSession,
	type AuthSessionBehavior,
	AuthSessionLayerFromBehavior,
} from "./authSession.js";

function fakeSession(token = "session-1"): PandoraSession {
	return {
		userAuthToken: token,
		partnerAuthToken: "partner",
		userId: "1",
		syncTime: 0,
	} as unknown as PandoraSession;
}

function fakeManager(label: string): SourceManager {
	return {
		__label: label,
		getSource: () => undefined,
		getAllSources: () => [],
		listAllPlaylists: async () => [],
		getPlaylistTracks: async () => [],
		getStreamUrl: async () => "",
		searchAll: async () => ({}) as never,
		getAlbumTracks: async () => ({}) as never,
	} as unknown as SourceManager;
}

type Knobs = {
	session?: PandoraSession | undefined;
	managerForSession?: (s: PandoraSession) => Promise<SourceManager>;
	managerFallback?: () => Promise<SourceManager>;
	refresh?: () => Promise<PandoraSession | undefined>;
	cooldownMs?: number;
	now?: () => number;
};

function makeLayer(knobs: Knobs = {}) {
	let current = knobs.session;
	const behavior: AuthSessionBehavior = {
		getSession: () => current,
		setSession: (next) => {
			current = next;
		},
		sourceManagerForSession:
			knobs.managerForSession ??
			(async (s) => fakeManager(`session:${s.userAuthToken}`)),
		sourceManagerFallback:
			knobs.managerFallback ?? (async () => fakeManager("fallback")),
		refresh: knobs.refresh ?? (async () => undefined),
		...(knobs.cooldownMs !== undefined ? { cooldownMs: knobs.cooldownMs } : {}),
		...(knobs.now !== undefined ? { now: knobs.now } : {}),
	};
	return AuthSessionLayerFromBehavior(behavior);
}

describe("requireSession", () => {
	it("fails with Unauthorized when no credentials are configured", async () => {
		const layer = makeLayer({ session: undefined });
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const auth = yield* AuthSession;
					return yield* Effect.result(auth.requireSession);
				}),
				layer,
			),
		);
		expect(result._tag).toBe("Failure");
		if (result._tag === "Failure") {
			expect(result.failure._tag).toBe("Unauthorized");
			expect(result.failure.code).toBe("pandora_credentials_required");
		}
	});

	it("returns session + source manager when credentials exist", async () => {
		const layer = makeLayer({ session: fakeSession("abc") });
		const ctx = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const auth = yield* AuthSession;
					return yield* auth.requireSession;
				}),
				layer,
			),
		);
		expect(ctx.pandoraSession.userAuthToken).toBe("abc");
		expect(ctx.sourceManager).toBeDefined();
	});
});

describe("getSourceManager", () => {
	it("returns the authenticated manager when a session exists", async () => {
		const session = fakeSession("with-session");
		const sessionManager = fakeManager("session-mgr");
		const fallbackManager = fakeManager("fallback-mgr");
		const layer = makeLayer({
			session,
			managerForSession: async () => sessionManager,
			managerFallback: async () => fallbackManager,
		});
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const auth = yield* AuthSession;
					return yield* auth.getSourceManager;
				}),
				layer,
			),
		);
		expect(result).toBe(sessionManager);
	});

	it("falls back to the unauthenticated manager when no session is configured", async () => {
		const fallbackManager = fakeManager("fallback-mgr");
		const layer = makeLayer({
			session: undefined,
			managerFallback: async () => fallbackManager,
		});
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const auth = yield* AuthSession;
					return yield* auth.getSourceManager;
				}),
				layer,
			),
		);
		expect(result).toBe(fallbackManager);
	});
});

describe("refresh", () => {
	it("coalesces concurrent refresh attempts onto one in-flight call", async () => {
		let calls = 0;
		const layer = makeLayer({
			refresh: async () => {
				calls += 1;
				await new Promise((resolve) => setTimeout(resolve, 5));
				return fakeSession(`refreshed-${calls}`);
			},
		});

		const program = Effect.provide(
			Effect.gen(function* () {
				const auth = yield* AuthSession;
				return yield* Effect.all([auth.refresh, auth.refresh, auth.refresh], {
					concurrency: "unbounded",
				});
			}),
			layer,
		);

		const [first, second, third] = await Effect.runPromise(program);
		expect(calls).toBe(1);
		expect(first.userAuthToken).toBe(second.userAuthToken);
		expect(second.userAuthToken).toBe(third.userAuthToken);
	});

	it("rate-caps subsequent refreshes after a failure", async () => {
		let now = 1_000;
		let calls = 0;
		const layer = makeLayer({
			cooldownMs: 30_000,
			now: () => now,
			refresh: async () => {
				calls += 1;
				return undefined; // simulate a failed refresh
			},
		});

		const program = Effect.provide(
			Effect.gen(function* () {
				const auth = yield* AuthSession;
				const first = yield* Effect.result(auth.refresh);
				// Advance the clock but stay within the cooldown window.
				now += 1_000;
				const second = yield* Effect.result(auth.refresh);
				return [first, second] as const;
			}),
			layer,
		);

		const [first, second] = await Effect.runPromise(program);
		expect(calls).toBe(1);
		expect(first._tag).toBe("Failure");
		if (first._tag === "Failure") {
			expect(first.failure._tag).toBe("AuthRefreshFailed");
			expect(first.failure.code).toBe("refresh_failed");
		}
		expect(second._tag).toBe("Failure");
		if (second._tag === "Failure") {
			expect(second.failure._tag).toBe("AuthRefreshFailed");
			expect(second.failure.code).toBe("refresh_rate_capped");
		}
	});

	it("returns AuthRefreshFailed when the refresh resolves without a session", async () => {
		const layer = makeLayer({ refresh: async () => undefined });
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const auth = yield* AuthSession;
					return yield* Effect.result(auth.refresh);
				}),
				layer,
			),
		);
		expect(result._tag).toBe("Failure");
		if (result._tag === "Failure") {
			expect(result.failure._tag).toBe("AuthRefreshFailed");
		}
	});
});

describe("withAuthRetry", () => {
	it("retries once on a known Pandora auth error with a refreshed session", async () => {
		const sessionA = fakeSession("stale");
		const sessionB = fakeSession("fresh");
		let calls = 0;
		const layer = makeLayer({
			session: sessionA,
			refresh: async () => sessionB,
			managerForSession: async (s) => fakeManager(`mgr-${s.userAuthToken}`),
		});

		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const auth = yield* AuthSession;
					return yield* auth.withAuthRetry((ctx) =>
						Effect.gen(function* () {
							calls += 1;
							if (calls === 1) {
								return yield* Effect.fail(
									new ApiCallError({
										method: "test.method",
										message: "auth expired",
										code: 1001,
									}),
								);
							}
							return ctx.pandoraSession.userAuthToken;
						}),
					);
				}),
				layer,
			),
		);

		expect(calls).toBe(2);
		expect(result).toBe("fresh");
	});

	it("propagates non-auth errors without refreshing", async () => {
		const session = fakeSession();
		let refreshes = 0;
		const layer = makeLayer({
			session,
			refresh: async () => {
				refreshes += 1;
				return fakeSession("never-used");
			},
		});

		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const auth = yield* AuthSession;
					return yield* Effect.result(
						auth.withAuthRetry(() =>
							Effect.fail(
								new ApiCallError({
									method: "other",
									message: "random failure",
									code: 9999,
								}),
							),
						),
					);
				}),
				layer,
			),
		);

		expect(refreshes).toBe(0);
		expect(result._tag).toBe("Failure");
	});

	it("fails with Unauthorized before the handler runs when no session is configured", async () => {
		let invoked = false;
		const layer = makeLayer({ session: undefined });
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const auth = yield* AuthSession;
					return yield* Effect.result(
						auth.withAuthRetry(() => {
							invoked = true;
							return Effect.succeed("ok");
						}),
					);
				}),
				layer,
			),
		);
		expect(invoked).toBe(false);
		expect(result._tag).toBe("Failure");
		if (result._tag === "Failure") {
			expect(result.failure._tag).toBe("Unauthorized");
		}
	});
});
