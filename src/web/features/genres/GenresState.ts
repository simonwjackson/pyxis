/**
 * @module GenresState
 *
 * Pure domain ADT for the genres page. Converts the `radio.genres.list`
 * AsyncResult into a closed tagged union so the page composes
 * state-specific surfaces rather than branching on raw runtime fields.
 *
 * `Empty` is split from `Ready` so the page can show a placeholder when
 * Pandora returns zero categories without sprinkling array-length checks
 * through JSX.
 */

import { AsyncResult } from "effect/unstable/reactivity";
import type { ApiPublicError } from "../../../api/contracts/common.js";
import type { ApiGenreCategory } from "../../../api/contracts/radio.js";

export type GenresState =
  | { readonly _tag: "Loading" }
  | { readonly _tag: "Empty" }
  | {
      readonly _tag: "Ready";
      readonly categories: readonly ApiGenreCategory[];
    }
  | { readonly _tag: "LoadError"; readonly error: ApiPublicError }
  | { readonly _tag: "Defect"; readonly defect: unknown };

export const GenresState = {
  fromResult(
    result: AsyncResult.AsyncResult<
      readonly ApiGenreCategory[],
      ApiPublicError
    >,
  ): GenresState {
    return AsyncResult.matchWithWaiting(result, {
      onWaiting: (): GenresState => ({ _tag: "Loading" }),
      onError: (error): GenresState => ({ _tag: "LoadError", error }),
      onDefect: (defect): GenresState => ({ _tag: "Defect", defect }),
      onSuccess: (success): GenresState => {
        const categories = success.value;
        if (categories.length === 0) {
          return { _tag: "Empty" };
        }
        return { _tag: "Ready", categories };
      },
    });
  },
};
