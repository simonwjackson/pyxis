import { describe, expect, it } from "bun:test";
import { Cause } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import type { ApiListenLogEntry } from "../../../api/contracts/listenLog.js";
import { HistoryState } from "./HistoryState.js";

const sampleEntry = (id: string): ApiListenLogEntry => ({
  id,
  compositeId: `ytmusic:${id}`,
  title: `Title ${id}`,
  artist: "Artist",
  source: "ytmusic",
  listenedAt: 1700000000000,
});

describe("HistoryState.fromResult", () => {
  it("returns Loading while the RPC is initial", () => {
    const state = HistoryState.fromResult(AsyncResult.initial(true), 0);
    expect(state._tag).toBe("Loading");
  });

  it("returns Empty with offset when the page is an empty list", () => {
    const result = AsyncResult.success<readonly ApiListenLogEntry[]>([]);
    const state = HistoryState.fromResult(result, 0);
    expect(state).toEqual({ _tag: "Empty", offset: 0 });
  });

  it("returns Ready with entries and offset for a populated page", () => {
    const entries = [sampleEntry("a"), sampleEntry("b")] as const;
    const result = AsyncResult.success<readonly ApiListenLogEntry[]>(entries);
    const state = HistoryState.fromResult(result, 50);
    expect(state).toEqual({ _tag: "Ready", entries, offset: 50 });
  });

  it("returns LoadError for typed RPC failures", () => {
    const error = { _tag: "NotFound" as const, resource: "listenLog" };
    const result = AsyncResult.failure<
      readonly ApiListenLogEntry[],
      typeof error
    >(Cause.fail(error));
    const state = HistoryState.fromResult(result, 0);
    expect(state).toEqual({ _tag: "LoadError", error });
  });

  it("returns Defect for non-error failures", () => {
    const defect = new Error("boom");
    const result = AsyncResult.failure<readonly ApiListenLogEntry[], never>(
      Cause.die(defect),
    );
    const state = HistoryState.fromResult(result, 0);
    expect(state._tag).toBe("Defect");
    if (state._tag === "Defect") {
      expect(state.defect).toBe(defect);
    }
  });
});
