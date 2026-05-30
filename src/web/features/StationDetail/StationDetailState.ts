/**
 * @module StationDetailState
 *
 * Pure domain ADT for the station-detail page. Converts the
 * `radio.station.get` AsyncResult into a closed tagged union so the page
 * composes state-specific surfaces rather than branching on raw runtime
 * fields.
 *
 * `NotFound` is split out from `LoadError` because the page shows a
 * different ("station not found.") message for the typed `NotFound`
 * public error; other public errors fall back to a generic load-error
 * surface, matching the legacy tRPC error rendering.
 */

import { AsyncResult } from "effect/unstable/reactivity";
import type { ApiPublicError } from "../../../api/contracts/common.js";
import type {
  ApiStationDetail,
  ApiStationFeedbackEntry,
  ApiStationSeed,
} from "../../../api/contracts/radio.js";

export type StationDetailState =
  | { readonly _tag: "Loading" }
  | { readonly _tag: "NotFound" }
  | { readonly _tag: "Ready"; readonly station: ApiStationDetail }
  | { readonly _tag: "LoadError"; readonly error: ApiPublicError }
  | { readonly _tag: "Defect"; readonly defect: unknown };

export type StationDetailSeedsState =
  | { readonly _tag: "Empty" }
  | {
      readonly _tag: "Ready";
      readonly artists: readonly ApiStationSeed[];
      readonly songs: readonly ApiStationSeed[];
    };

export type StationDetailFeedbackState =
  | { readonly _tag: "Empty" }
  | {
      readonly _tag: "Ready";
      readonly liked: readonly ApiStationFeedbackEntry[];
      readonly disliked: readonly ApiStationFeedbackEntry[];
    };

export const StationDetailState = {
  seeds(station: ApiStationDetail): StationDetailSeedsState {
    const artists = station.music?.artists ?? [];
    const songs = station.music?.songs ?? [];
    if (artists.length === 0 && songs.length === 0) return { _tag: "Empty" };
    return { _tag: "Ready", artists, songs };
  },

  feedback(station: ApiStationDetail): StationDetailFeedbackState {
    const liked = station.feedback?.thumbsUp ?? [];
    const disliked = station.feedback?.thumbsDown ?? [];
    if (liked.length === 0 && disliked.length === 0) return { _tag: "Empty" };
    return { _tag: "Ready", liked, disliked };
  },

  fromResult(
    result: AsyncResult.AsyncResult<ApiStationDetail, ApiPublicError>,
  ): StationDetailState {
    return AsyncResult.matchWithWaiting(result, {
      onWaiting: (): StationDetailState => ({ _tag: "Loading" }),
      onError: (error): StationDetailState => {
        if (error._tag === "NotFound") {
          return { _tag: "NotFound" };
        }
        return { _tag: "LoadError", error };
      },
      onDefect: (defect): StationDetailState => ({ _tag: "Defect", defect }),
      onSuccess: (success): StationDetailState => ({
        _tag: "Ready",
        station: success.value,
      }),
    });
  },
};
