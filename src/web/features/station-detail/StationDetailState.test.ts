import { describe, expect, it } from "bun:test";
import { Cause } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import type { ApiStationDetail } from "../../../api/contracts/radio.js";
import { StationDetailState } from "./StationDetailState.js";

const sampleStation = (): ApiStationDetail => ({
  id: "pandora:abc",
  stationId: "pandora:s-abc",
  name: "Sample Station",
  music: {
    artists: [
      {
        seedId: "seed-1",
        musicToken: "tok-1",
        artistName: "Artist 1",
      },
    ],
    songs: [],
  },
  feedback: {
    thumbsUp: [],
    thumbsDown: [],
  },
});

describe("StationDetailState.fromResult", () => {
  it("returns Loading while the RPC is initial", () => {
    const state = StationDetailState.fromResult(AsyncResult.initial(true));
    expect(state._tag).toBe("Loading");
  });

  it("returns Ready with the decoded station detail on success", () => {
    const station = sampleStation();
    const result = AsyncResult.success<ApiStationDetail>(station);
    expect(StationDetailState.fromResult(result)).toEqual({
      _tag: "Ready",
      station,
    });
  });

  it("returns NotFound when the RPC fails with a NotFound public error", () => {
    const error = {
      _tag: "NotFound" as const,
      resource: "station",
    };
    const result = AsyncResult.failure<ApiStationDetail, typeof error>(
      Cause.fail(error),
    );
    expect(StationDetailState.fromResult(result)).toEqual({ _tag: "NotFound" });
  });

  it("returns LoadError for other typed public RPC failures", () => {
    const error = {
      _tag: "Unauthorized" as const,
      reason: "no credentials",
    };
    const result = AsyncResult.failure<ApiStationDetail, typeof error>(
      Cause.fail(error),
    );
    expect(StationDetailState.fromResult(result)).toEqual({
      _tag: "LoadError",
      error,
    });
  });

  it("returns Defect for non-error (transport) failures", () => {
    const defect = new Error("transport boom");
    const result = AsyncResult.failure<ApiStationDetail, never>(
      Cause.die(defect),
    );
    const state = StationDetailState.fromResult(result);
    expect(state._tag).toBe("Defect");
    if (state._tag === "Defect") {
      expect(state.defect).toBe(defect);
    }
  });
});
