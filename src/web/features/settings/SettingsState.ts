/**
 * @module SettingsState
 *
 * Domain ADT for the Settings page. The page composes three reads
 * (`auth.status.get`, `auth.settings.get`, `auth.usage.get`) and one mutation
 * (`auth.explicitFilter.set`). The legacy implementation used React Query's
 * `enabled` flag to skip the settings/usage reads when Pandora was absent,
 * which produced silent idle states. The ADT makes the same conditional
 * explicit:
 *
 * - `Loading`     — auth status is still resolving.
 * - `NoAccount`   — auth status loaded with `hasPandora === false`.
 * - `Unavailable` — auth status itself errored or defected.
 * - `Ready`       — auth status loaded with Pandora; settings/usage may
 *                   still be loading or absent, but the page can render.
 */

import { AsyncResult } from "effect/unstable/reactivity";
import type {
  ApiAuthStatus,
  ApiSettings,
  ApiUsageInfo,
} from "../../../api/contracts/auth.js";
import type { ApiPublicError } from "../../../api/contracts/common.js";

export type SettingsState =
  | { readonly _tag: "Loading" }
  | { readonly _tag: "Unavailable" }
  | { readonly _tag: "NoAccount" }
  | {
      readonly _tag: "Ready";
      readonly settings: ApiSettings | null;
      readonly usage: ApiUsageInfo | null;
    };

export const SettingsState = {
  fromResults(
    statusResult: AsyncResult.AsyncResult<ApiAuthStatus, ApiPublicError>,
    settingsResult: AsyncResult.AsyncResult<ApiSettings, ApiPublicError>,
    usageResult: AsyncResult.AsyncResult<ApiUsageInfo, ApiPublicError>,
  ): SettingsState {
    return AsyncResult.matchWithWaiting(statusResult, {
      onWaiting: (): SettingsState => ({ _tag: "Loading" }),
      onError: (): SettingsState => ({ _tag: "Unavailable" }),
      onDefect: (): SettingsState => ({ _tag: "Unavailable" }),
      onSuccess: (status): SettingsState => {
        if (!status.value.hasPandora) {
          return { _tag: "NoAccount" };
        }
        return {
          _tag: "Ready",
          settings: extractValue(settingsResult),
          usage: extractValue(usageResult),
        };
      },
    });
  },
};

function extractValue<A>(
  result: AsyncResult.AsyncResult<A, ApiPublicError>,
): A | null {
  return result._tag === "Success" ? result.value : null;
}
