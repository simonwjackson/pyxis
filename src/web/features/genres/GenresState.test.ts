import { describe, expect, it } from "bun:test";
import { Cause } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import type { ApiGenreCategory } from "../../../api/contracts/radio.js";
import { GenresState } from "./GenresState.js";

const sampleCategory = (name: string): ApiGenreCategory => ({
  categoryName: name,
  stations: [
    { stationToken: `${name}-1`, stationName: `${name} Station 1` },
    { stationToken: `${name}-2`, stationName: `${name} Station 2` },
  ],
});

describe("GenresState.fromResult", () => {
  it("returns Loading while the genres RPC is initial", () => {
    const state = GenresState.fromResult(AsyncResult.initial(true));
    expect(state._tag).toBe("Loading");
  });

  it("returns Empty when Pandora reports no genre categories", () => {
    const result = AsyncResult.success<readonly ApiGenreCategory[]>([]);
    expect(GenresState.fromResult(result)).toEqual({ _tag: "Empty" });
  });

  it("returns Ready with the categories when populated", () => {
    const categories = [
      sampleCategory("Rock"),
      sampleCategory("Jazz"),
    ] as const;
    const result = AsyncResult.success<readonly ApiGenreCategory[]>(categories);
    expect(GenresState.fromResult(result)).toEqual({
      _tag: "Ready",
      categories,
    });
  });

  it("returns LoadError for typed public RPC failures", () => {
    const error = {
      _tag: "Unauthorized" as const,
      code: "no_credentials",
    };
    const result = AsyncResult.failure<
      readonly ApiGenreCategory[],
      typeof error
    >(Cause.fail(error));
    expect(GenresState.fromResult(result)).toEqual({
      _tag: "LoadError",
      error,
    });
  });

  it("returns Defect for non-error failures", () => {
    const defect = new Error("transport boom");
    const result = AsyncResult.failure<readonly ApiGenreCategory[], never>(
      Cause.die(defect),
    );
    const state = GenresState.fromResult(result);
    expect(state._tag).toBe("Defect");
    if (state._tag === "Defect") {
      expect(state.defect).toBe(defect);
    }
  });
});
