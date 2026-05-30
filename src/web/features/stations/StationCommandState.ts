/**
 * @module StationCommandState
 *
 * Shared command ADT for the station management dialogs (delete, rename,
 * quick-mix, add-seed). Mutation atoms expose an `AsyncResult` of the most
 * recent invocation; the dialogs adapt that into a named state so the
 * "Saving..." / disabled-button flow is part of the contract rather than a
 * raw transport check.
 *
 * `Idle` distinguishes "never invoked" from `Submitting`, and `Succeeded`
 * lets the dialog dismiss itself in response to the same ADT it renders
 * from. Toasts remain side-effected at the call site since they are
 * notification UX, not domain state.
 */

import { AsyncResult } from "effect/unstable/reactivity";
import type { ApiPublicError } from "../../../api/contracts/common.js";

export type StationCommandState =
  | { readonly _tag: "Idle" }
  | { readonly _tag: "Submitting" }
  | { readonly _tag: "Succeeded" }
  | { readonly _tag: "Failed"; readonly error: ApiPublicError }
  | { readonly _tag: "Defect"; readonly defect: unknown };

export const StationCommandState = {
  fromResult<A>(
    result: AsyncResult.AsyncResult<A, ApiPublicError>,
  ): StationCommandState {
    if (result._tag === "Initial" && !result.waiting) {
      return { _tag: "Idle" };
    }
    return AsyncResult.matchWithWaiting(result, {
      onWaiting: (): StationCommandState => ({ _tag: "Submitting" }),
      onError: (error): StationCommandState => ({ _tag: "Failed", error }),
      onDefect: (defect): StationCommandState => ({ _tag: "Defect", defect }),
      onSuccess: (): StationCommandState => ({ _tag: "Succeeded" }),
    });
  },
  isSubmitting(state: StationCommandState): boolean {
    return state._tag === "Submitting";
  },
};
