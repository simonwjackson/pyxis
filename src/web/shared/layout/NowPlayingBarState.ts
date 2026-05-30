/**
 * @module @app/web/shared/layout/NowPlayingBarState
 *
 * Pure projection helpers for the now-playing bar. The UI intentionally
 * keeps rendering with a manual queue context until the realtime queue
 * stream emits, matching the legacy subscription's initial local state.
 */

import { AsyncResult } from "effect/unstable/reactivity";
import type { ApiQueueState } from "../../../api/contracts/queue.js";
import type { PlaybackQueueContext } from "../playback/types.js";

export type NowPlayingBarState =
  | { readonly _tag: "Fallback" }
  | {
      readonly _tag: "Synced";
      readonly queueContext: PlaybackQueueContext;
      readonly queueIndex: number;
    };

const fallbackContext: PlaybackQueueContext = { type: "manual" };

export const NowPlayingBarState = {
  fromQueueResult(
    result: AsyncResult.AsyncResult<ApiQueueState, unknown>,
  ): NowPlayingBarState {
    if (!AsyncResult.isSuccess(result)) return { _tag: "Fallback" };
    return {
      _tag: "Synced",
      queueContext: result.value.context,
      queueIndex: result.value.currentIndex,
    };
  },

  queueContext(state: NowPlayingBarState): PlaybackQueueContext {
    switch (state._tag) {
      case "Fallback":
        return fallbackContext;
      case "Synced":
        return state.queueContext;
    }
  },

  queueIndex(state: NowPlayingBarState): number {
    switch (state._tag) {
      case "Fallback":
        return 0;
      case "Synced":
        return state.queueIndex;
    }
  },
};
