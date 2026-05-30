import { describe, expect, it } from "bun:test";
import { Cause } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { StationCommandState } from "./StationCommandState.js";

describe("StationCommandState.fromResult", () => {
  it("is Idle before the mutation is invoked", () => {
    expect(StationCommandState.fromResult(AsyncResult.initial(false))).toEqual({
      _tag: "Idle",
    });
  });

  it("is Submitting while the mutation is in flight", () => {
    expect(StationCommandState.fromResult(AsyncResult.initial(true))).toEqual({
      _tag: "Submitting",
    });
  });

  it("is Submitting when a previous success is being re-run", () => {
    const success = AsyncResult.success<number>(1);
    const waiting = AsyncResult.waiting(success);
    expect(StationCommandState.fromResult(waiting)).toEqual({
      _tag: "Submitting",
    });
  });

  it("is Succeeded after a successful invocation", () => {
    expect(StationCommandState.fromResult(AsyncResult.success(42))).toEqual({
      _tag: "Succeeded",
    });
  });

  it("is Failed with the typed public error after a failed invocation", () => {
    const error = {
      _tag: "ValidationError" as const,
      path: [],
      message: "bad input",
    };
    const result = AsyncResult.failure<number, typeof error>(Cause.fail(error));
    expect(StationCommandState.fromResult(result)).toEqual({
      _tag: "Failed",
      error,
    });
  });

  it("is Defect when the cause is a die rather than a typed error", () => {
    const defect = new Error("boom");
    const result = AsyncResult.failure<number, never>(Cause.die(defect));
    const state = StationCommandState.fromResult(result);
    expect(state._tag).toBe("Defect");
    if (state._tag === "Defect") {
      expect(state.defect).toBe(defect);
    }
  });

  it("reports isSubmitting for the Submitting case only", () => {
    expect(StationCommandState.isSubmitting({ _tag: "Submitting" })).toBe(true);
    expect(StationCommandState.isSubmitting({ _tag: "Idle" })).toBe(false);
    expect(StationCommandState.isSubmitting({ _tag: "Succeeded" })).toBe(false);
  });
});
