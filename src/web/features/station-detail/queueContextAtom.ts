/**
 * @module queueContextAtom
 *
 * Minimal domain atom that exposes the latest `queue.state.stream` snapshot
 * for the station-detail page. The page only reads `state.context` (to
 * decide whether to render the "Play" button on the header), so the atom
 * holds the entire {@link ApiQueueState} and the page narrows locally.
 *
 * The atom is created over the shared {@link pyxisRpcRuntime}. The runtime
 * subscribes to the streaming RPC and continuously republishes the latest
 * emitted snapshot via the underlying `Stream.run` machinery, so consumers
 * see an {@link AsyncResult} that transitions from `Initial -> Waiting ->
 * Success` and then stays in `Success` (with the most recent queue state)
 * for the lifetime of the component subtree.
 *
 * Kept local to the station-detail feature for this U6 slice. Future U6
 * work that migrates `now-playing-bar` away from `trpc.queue.onChange`
 * should lift this into a shared module instead of duplicating the seam.
 */

import { Effect, Stream } from "effect";
import { PyxisRpcClient } from "@/web/shared/api/rpcClient";
import { pyxisRpcRuntime } from "@/web/shared/effect/runtime";

/**
 * Latest queue state snapshot from `queue.state.stream`. The atom value is
 * `AsyncResult<ApiQueueState, ApiPublicError | RpcClientError>` per the
 * {@link pyxisRpcRuntime} atom contract — stream emissions update the
 * `Success` value in place.
 */
export const queueStateStreamAtom = pyxisRpcRuntime.atom(() =>
	Stream.unwrap(
		Effect.gen(function* () {
			const client = yield* PyxisRpcClient;
			return client("queue.state.stream", undefined);
		}),
	),
);
