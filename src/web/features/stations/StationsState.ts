/**
 * @module StationsState
 *
 * Pure domain ADT for the stations page. Converts the
 * `radio.stations.list` AsyncResult into a closed tagged union so the page
 * composes state-specific surfaces rather than branching on raw runtime
 * fields.
 *
 * Filtering is widget-local UI state (the page owns the filter input) so
 * `Ready` always carries the full set of stations and the page narrows
 * locally.
 */

import { AsyncResult } from "effect/unstable/reactivity";
import type { ApiPublicError } from "../../../api/contracts/common.js";
import type { ApiStationSummary } from "../../../api/contracts/radio.js";

export type StationsState =
	| { readonly _tag: "Loading" }
	| { readonly _tag: "Empty" }
	| {
			readonly _tag: "Ready";
			readonly stations: readonly ApiStationSummary[];
	  }
	| { readonly _tag: "LoadError"; readonly error: ApiPublicError }
	| { readonly _tag: "Defect"; readonly defect: unknown };

export const StationsState = {
	fromResult(
		result: AsyncResult.AsyncResult<
			readonly ApiStationSummary[],
			ApiPublicError
		>,
	): StationsState {
		return AsyncResult.matchWithWaiting(result, {
			onWaiting: (): StationsState => ({ _tag: "Loading" }),
			onError: (error): StationsState => ({ _tag: "LoadError", error }),
			onDefect: (defect): StationsState => ({ _tag: "Defect", defect }),
			onSuccess: (success): StationsState => {
				const stations = success.value;
				if (stations.length === 0) {
					return { _tag: "Empty" };
				}
				return { _tag: "Ready", stations };
			},
		});
	},
};
