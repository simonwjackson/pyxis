/**
 * @module HistoryState
 *
 * Pure domain ADT for the history page. Converts the RPC AsyncResult from
 * `listenLog.entries.list` into a closed tagged union (`Loading`, `Ready`,
 * `Empty`, `LoadError`, `Defect`) so the page composes named states rather
 * than branching on raw runtime primitives.
 *
 * The Empty case is intentionally separate from Ready so the first-page
 * empty messaging (`"no history"`) is part of the contract rather than a
 * conditional inside JSX.
 */

import { AsyncResult } from "effect/unstable/reactivity";
import type { ApiPublicError } from "../../../api/contracts/common.js";
import type { ApiListenLogEntry } from "../../../api/contracts/listenLog.js";

export type HistoryState =
  | { readonly _tag: "Loading" }
  | { readonly _tag: "Empty"; readonly offset: number }
  | {
      readonly _tag: "Ready";
      readonly entries: readonly ApiListenLogEntry[];
      readonly offset: number;
    }
  | { readonly _tag: "LoadError"; readonly error: ApiPublicError }
  | { readonly _tag: "Defect"; readonly defect: unknown };

export const HistoryState = {
  fromResult(
    result: AsyncResult.AsyncResult<
      readonly ApiListenLogEntry[],
      ApiPublicError
    >,
    offset: number,
  ): HistoryState {
    return AsyncResult.matchWithWaiting(result, {
      onWaiting: (): HistoryState => ({ _tag: "Loading" }),
      onError: (error): HistoryState => ({ _tag: "LoadError", error }),
      onDefect: (defect): HistoryState => ({ _tag: "Defect", defect }),
      onSuccess: (success): HistoryState => {
        const entries = success.value;
        if (entries.length === 0) {
          return { _tag: "Empty", offset };
        }
        return { _tag: "Ready", entries, offset };
      },
    });
  },
};
