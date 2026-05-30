/**
 * @module AuthStatusState
 *
 * Pure ADT for the auth status read used by the shell navigation (`Sidebar`
 * and `MobileNav`). The shell needs a boolean `hasPandora` to gate Pandora
 * nav entries; we model the load explicitly with `Loading`, `Ready`, and
 * `Unavailable` so the nav can render predictably while the request is in
 * flight or unreachable.
 */

import { AsyncResult } from "effect/unstable/reactivity";
import type { ApiAuthStatus } from "../../../api/contracts/auth.js";
import type { ApiPublicError } from "../../../api/contracts/common.js";

export type AuthStatusState =
  | { readonly _tag: "Loading" }
  | {
      readonly _tag: "Ready";
      readonly hasPandora: boolean;
      readonly authenticated: boolean;
    }
  | { readonly _tag: "Unavailable" };

export const AuthStatusState = {
  fromResult(
    result: AsyncResult.AsyncResult<ApiAuthStatus, ApiPublicError>,
  ): AuthStatusState {
    return AsyncResult.matchWithWaiting(result, {
      onWaiting: (): AuthStatusState => ({ _tag: "Loading" }),
      onError: (): AuthStatusState => ({ _tag: "Unavailable" }),
      onDefect: (): AuthStatusState => ({ _tag: "Unavailable" }),
      onSuccess: (success): AuthStatusState => ({
        _tag: "Ready",
        hasPandora: success.value.hasPandora,
        authenticated: success.value.authenticated,
      }),
    });
  },
};
