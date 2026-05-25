import { describe, expect, it } from "bun:test";
import { Cause } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { projectQueryResult } from "./projectQueryResult.js";

describe("projectQueryResult", () => {
	it("passes Success through unchanged", () => {
		const result = AsyncResult.success<number>(42);
		const projected = projectQueryResult(result);
		expect(projected._tag).toBe("Success");
		if (projected._tag === "Success") {
			expect(projected.value).toBe(42);
		}
	});

	it("passes Initial/Waiting through unchanged", () => {
		const result = AsyncResult.initial<number>(true);
		const projected = projectQueryResult(result);
		expect(projected._tag).toBe("Initial");
	});

	it("preserves a typed ApiPublicError in the LoadError channel", () => {
		const error = { _tag: "NotFound" as const, resource: "thing" };
		const result = AsyncResult.failure<number, typeof error>(Cause.fail(error));
		const projected = projectQueryResult(result);
		expect(projected._tag).toBe("Failure");
		if (projected._tag === "Failure") {
			const failure = Cause.findErrorOption(projected.cause);
			expect(failure._tag).toBe("Some");
			if (failure._tag === "Some") {
				expect(failure.value).toEqual(error);
			}
		}
	});

	it("routes unrecognized fail errors (e.g. RpcClientError) into defects", () => {
		const transport = { _tag: "RpcClientError", reason: { _tag: "boom" } };
		const result = AsyncResult.failure<number, typeof transport>(
			Cause.fail(transport) as never,
		);
		const projected = projectQueryResult(result);
		expect(projected._tag).toBe("Failure");
		if (projected._tag === "Failure") {
			expect(Cause.findErrorOption(projected.cause)._tag).toBe("None");
			expect(Cause.findDefect(projected.cause)._tag).toBe("Success");
		}
	});

	it("preserves defects (Cause.die) by re-wrapping them as defects", () => {
		const result = AsyncResult.failure<number, never>(Cause.die("boom"));
		const projected = projectQueryResult(result);
		expect(projected._tag).toBe("Failure");
		if (projected._tag === "Failure") {
			expect(Cause.findErrorOption(projected.cause)._tag).toBe("None");
			expect(Cause.findDefect(projected.cause)._tag).toBe("Success");
		}
	});
});
