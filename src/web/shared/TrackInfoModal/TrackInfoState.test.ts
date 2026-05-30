import { describe, expect, it } from "bun:test";
import { Cause } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import type { ApiTrackExplainResponse } from "../../../api/contracts/track.js";
import { TrackInfoState } from "./TrackInfoState.js";

const empty: ApiTrackExplainResponse = { explanations: [] };
const ready: ApiTrackExplainResponse = {
  explanations: [{ traitId: "t1", traitName: "Trait 1" }],
};

describe("TrackInfoState.fromResult", () => {
  it("is Loading while initial", () => {
    expect(TrackInfoState.fromResult(AsyncResult.initial(true))).toEqual({
      _tag: "Loading",
    });
  });

  it("is Empty when traits list is empty", () => {
    expect(TrackInfoState.fromResult(AsyncResult.success(empty))).toEqual({
      _tag: "Empty",
    });
  });

  it("is Ready when traits are present", () => {
    expect(TrackInfoState.fromResult(AsyncResult.success(ready))).toEqual({
      _tag: "Ready",
      traits: ready.explanations,
    });
  });

  it("is LoadError on typed RPC failures", () => {
    const result = AsyncResult.failure<ApiTrackExplainResponse, never>(
      Cause.fail({ _tag: "NotFound", resource: "track" }) as never,
    );
    expect(TrackInfoState.fromResult(result)).toEqual({ _tag: "LoadError" });
  });

  it("is Defect on transport defects", () => {
    const result = AsyncResult.failure<ApiTrackExplainResponse, never>(
      Cause.die("boom"),
    );
    expect(TrackInfoState.fromResult(result)).toEqual({ _tag: "Defect" });
  });
});
