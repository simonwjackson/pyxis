/**
 * @module @app/web/shared/api/rpcClient
 *
 * Browser-side seam for the Pyxis Effect RPC client. Production code uses
 * {@link PyxisRpcClient} to build query/mutation atoms over the protocol
 * layer exposed by {@link rpcProtocolLayerAtom}. Tests and Storybook
 * composition roots override that atom to inject an in-memory protocol.
 *
 * Feature code MUST go through this module rather than constructing an
 * `RpcClient`, `RpcGroup`, or fetch call directly so the wire boundary stays
 * single-sourced (`src/api/rpc.ts`).
 */

import { AtomRpc } from "effect/unstable/reactivity";
import { PyxisRpc } from "../../../api/rpc.js";
import { rpcProtocolLayerAtom } from "../effect/layerAtom.js";

/**
 * AtomRpc service for the full {@link PyxisRpc} group.
 *
 * - `PyxisRpcClient.query(tag, payload, options?)` -> read atom over a
 *   non-streaming RPC.
 * - `PyxisRpcClient.mutation(tag)` -> write atom over a non-streaming RPC.
 * - `PyxisRpcClient.runtime` -> the underlying Atom runtime; feature code
 *   uses this for arbitrary `runtime.atom(...)` / `runtime.pull(...)` cases
 *   such as the player/queue snapshot streams.
 */
export class PyxisRpcClient extends AtomRpc.Service<PyxisRpcClient>()(
	"@app/web/PyxisRpcClient",
	{
		group: PyxisRpc,
		protocol: (get) => get(rpcProtocolLayerAtom),
		spanPrefix: "rpc.client",
	},
) {}
