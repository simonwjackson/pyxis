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
  test("uses manual context before the queue stream emits", () => {
    expect(NowPlayingBarState.fromQueueResult(AsyncResult.initial())).toEqual({
      queueContext: { type: "manual" },
      queueIndex: 0,
    });
  });

  test("uses the latest queue stream snapshot", () => {
    expect(
      NowPlayingBarState.fromQueueResult(AsyncResult.success(queueState)),
    ).toEqual({
      queueContext: { type: "radio", seedId: "pandora:station:123" },
      queueIndex: 3,
    });
  });

  test("keeps the fallback context when the queue stream fails", () => {
    expect(
      NowPlayingBarState.fromQueueResult(
        AsyncResult.failure(Cause.die(new Error("stream disconnected"))),
      ),
    ).toEqual({
      queueContext: { type: "manual" },
      queueIndex: 0,
    });
  });
});
