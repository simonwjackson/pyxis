import { describe, expect, it } from "bun:test";
import { Cause } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import type { ApiAuthStatus } from "../../../api/contracts/auth.js";
import { AuthStatusState } from "./AuthStatusState.js";

const ready: ApiAuthStatus = { authenticated: true, hasPandora: true };

describe("AuthStatusState.fromResult", () => {
	it("is Loading while initial", () => {
		expect(AuthStatusState.fromResult(AsyncResult.initial(true))).toEqual({
			_tag: "Loading",
		});
	});

	it("is Ready for a successful auth status", () => {
		const result = AsyncResult.success<ApiAuthStatus>(ready);
		expect(AuthStatusState.fromResult(result)).toEqual({
			_tag: "Ready",
			hasPandora: true,
			authenticated: true,
		});
	});

	it("is Unavailable for typed errors", () => {
		const result = AsyncResult.failure<ApiAuthStatus, never>(
			Cause.fail({ _tag: "Unauthorized", code: "no_session" }) as never,
		);
		expect(AuthStatusState.fromResult(result)).toEqual({
			_tag: "Unavailable",
		});
	});

	it("is Unavailable for transport defects", () => {
		const result = AsyncResult.failure<ApiAuthStatus, never>(
			Cause.die(new Error("boom")),
		);
		expect(AuthStatusState.fromResult(result)).toEqual({
			_tag: "Unavailable",
		});
	});
});
