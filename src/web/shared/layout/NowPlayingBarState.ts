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

export type NowPlayingBarState = {
  readonly queueContext: PlaybackQueueContext;
  readonly queueIndex: number;
};

const fallbackState: NowPlayingBarState = {
  queueContext: { type: "manual" },
  queueIndex: 0,
};

export const NowPlayingBarState = {
  fromQueueResult(
    result: AsyncResult.AsyncResult<ApiQueueState, unknown>,
  ): NowPlayingBarState {
    if (!AsyncResult.isSuccess(result)) return fallbackState;
    return {
      queueContext: result.value.context,
      queueIndex: result.value.currentIndex,
    };
  },
};
