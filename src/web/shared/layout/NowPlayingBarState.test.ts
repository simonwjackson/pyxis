import { describe, expect, test } from "bun:test";
import { Cause } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import type { ApiQueueState } from "../../../api/contracts/queue.js";
import { NowPlayingBarState } from "./NowPlayingBarState.js";

const queueState: ApiQueueState = {
  items: [],
  currentIndex: 3,
  context: { type: "radio", seedId: "pandora:station:123" },
};

describe("NowPlayingBarState.fromQueueResult", () => {
  test("uses manual fallback before the queue stream emits", () => {
    const state = NowPlayingBarState.fromQueueResult(AsyncResult.initial());

    expect(state).toEqual({ _tag: "Fallback" });
    expect(NowPlayingBarState.queueContext(state)).toEqual({ type: "manual" });
    expect(NowPlayingBarState.queueIndex(state)).toBe(0);
  });

  test("uses the latest queue stream snapshot", () => {
    const state = NowPlayingBarState.fromQueueResult(
      AsyncResult.success(queueState),
    );

    expect(state).toEqual({
      _tag: "Synced",
      queueContext: { type: "radio", seedId: "pandora:station:123" },
      queueIndex: 3,
    });
    expect(NowPlayingBarState.queueContext(state)).toEqual({
      type: "radio",
      seedId: "pandora:station:123",
    });
    expect(NowPlayingBarState.queueIndex(state)).toBe(3);
  });

  test("keeps the fallback context when the queue stream fails", () => {
    const state = NowPlayingBarState.fromQueueResult(
      AsyncResult.failure(Cause.die(new Error("stream disconnected"))),
    );

    expect(state).toEqual({ _tag: "Fallback" });
    expect(NowPlayingBarState.queueContext(state)).toEqual({ type: "manual" });
    expect(NowPlayingBarState.queueIndex(state)).toBe(0);
  });
});
