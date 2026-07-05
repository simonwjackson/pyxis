import { describe, expect, it } from "bun:test";
import { Cause } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import type { ApiQueueState } from "../../../../api/contracts/queue.js";
import { queueCoverflowStateFromResult } from "./QueueCoverflowState.js";

function queueState(
  items: ApiQueueState["items"],
  currentIndex = 0,
): ApiQueueState {
  return { items, currentIndex, context: { type: "manual" } };
}

const track = {
  id: "ytmusic:one",
  title: "One",
  artist: "Artist",
  album: "Album",
  duration: 200,
  artworkUrl: "https://example.com/one.jpg",
};

describe("queueCoverflowStateFromResult", () => {
  it("is Loading while the queue stream is waiting", () => {
    expect(queueCoverflowStateFromResult(AsyncResult.initial(true))._tag).toBe(
      "Loading",
    );
  });

  it("is Empty when the resolved queue has no artwork-bearing tracks", () => {
    const result = AsyncResult.success(
      queueState([{ ...track, artworkUrl: null }]),
    );
    expect(queueCoverflowStateFromResult(result)._tag).toBe("Empty");
  });

  it("projects a populated queue into Ready with a clamped active index", () => {
    const result = AsyncResult.success(queueState([track, track], 9));
    const state = queueCoverflowStateFromResult(result);
    expect(state).toMatchObject({ _tag: "Ready", activeIndex: 1 });
    if (state._tag === "Ready") {
      expect(state.tracks).toHaveLength(2);
      expect(state.tracks[0]?.artwork).toBe(track.artworkUrl);
    }
  });

  it("is LoadError for a typed failure", () => {
    const result = AsyncResult.failure(
      Cause.fail({ _tag: "PersistenceError", code: "x" }),
    );
    expect(queueCoverflowStateFromResult(result)._tag).toBe("LoadError");
  });

  it("is Defect for a transport die", () => {
    const result = AsyncResult.failure(Cause.die(new Error("boom")));
    expect(queueCoverflowStateFromResult(result)._tag).toBe("Defect");
  });
});
