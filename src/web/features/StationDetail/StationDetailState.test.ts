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

const sampleFeedback = () => ({
  feedbackId: "feedback-1",
  songName: "Liked Song",
  artistName: "Liked Artist",
  isPositive: true,
  dateCreated: { time: 123 },
});

describe("StationDetailState.seeds", () => {
  it("returns Empty when the station has no seed arrays", () => {
    expect(
      StationDetailState.seeds({ ...sampleStation(), music: undefined }),
    ).toEqual({ _tag: "Empty" });
  });

  it("returns Ready with artist and song seeds when present", () => {
    const station = sampleStation();
    expect(StationDetailState.seeds(station)).toEqual({
      _tag: "Ready",
      artists: station.music?.artists,
      songs: station.music?.songs,
    });
  });
});

describe("StationDetailState.feedback", () => {
  it("returns Empty when no feedback exists", () => {
    expect(StationDetailState.feedback(sampleStation())).toEqual({
      _tag: "Empty",
    });
  });

  it("returns Ready with liked and disliked feedback when present", () => {
    const liked = sampleFeedback();
    const disliked = {
      ...sampleFeedback(),
      feedbackId: "feedback-2",
      isPositive: false,
    };
    const station = {
      ...sampleStation(),
      feedback: { thumbsUp: [liked], thumbsDown: [disliked] },
    };

    expect(StationDetailState.feedback(station)).toEqual({
      _tag: "Ready",
      liked: [liked],
      disliked: [disliked],
    });
  });
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
