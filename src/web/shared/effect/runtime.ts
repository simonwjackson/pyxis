/**
 * @module @app/web/shared/effect/runtime
 *
 * Re-export seam for the application's Effect atom runtime. Features that
 * need access to the underlying `Atom.AtomRuntime` (for streaming RPCs,
 * raw `runtime.atom(...)`, or service-backed effects) import
 * {@link pyxisRpcRuntime} from here so the seam is documented and stable.
 *
 * Most feature code should not need this directly — `PyxisRpcClient.query`
 * and `PyxisRpcClient.mutation` already wrap the runtime. This module exists
 * to keep the runtime accessible without re-importing the RPC client class
 * everywhere.
 */

import { PyxisRpcClient } from "../api/rpcClient.js";

/**
 * The Pyxis Effect atom runtime, derived from {@link PyxisRpcClient}. Bound
 * to the override-able {@link rpcProtocolLayerAtom} so harness wiring is
 * mechanical.
 */
export const pyxisRpcRuntime = PyxisRpcClient.runtime;
