/**
 * @module TrackInfoState
 *
 * Pure ADT for the music-genome traits read inside the track info modal.
 * The modal previously branched on `isLoading`, `error`, and `data` directly;
 * this ADT makes the empty/ready/error split explicit so the UI composes
 * named state components.
 */

import { AsyncResult } from "effect/unstable/reactivity";
import type { ApiPublicError } from "../../../api/contracts/common.js";
import type { ApiTrackExplainResponse } from "../../../api/contracts/track.js";

type TrackTrait = ApiTrackExplainResponse["explanations"][number];

export type TrackInfoState =
  | { readonly _tag: "Loading" }
  | { readonly _tag: "Empty" }
  | { readonly _tag: "Ready"; readonly traits: readonly TrackTrait[] }
  | { readonly _tag: "LoadError" }
  | { readonly _tag: "Defect" };

export const TrackInfoState = {
  fromResult(
    result: AsyncResult.AsyncResult<ApiTrackExplainResponse, ApiPublicError>,
  ): TrackInfoState {
    return AsyncResult.matchWithWaiting(result, {
      onWaiting: (): TrackInfoState => ({ _tag: "Loading" }),
      onError: (): TrackInfoState => ({ _tag: "LoadError" }),
      onDefect: (): TrackInfoState => ({ _tag: "Defect" }),
      onSuccess: (success): TrackInfoState => {
        if (success.value.explanations.length === 0) {
          return { _tag: "Empty" };
        }
        return { _tag: "Ready", traits: success.value.explanations };
      },
    });
  },
};
