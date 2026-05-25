/**
 * @module @app/web/shared/playback/queueStateStreamAtom
 *
 * Shared realtime Effect atom for the current playback queue snapshot.
 * It replaces the legacy queue-change subscription consumers with the
 * authoritative `queue.state.stream` RPC stream.
 */

import { Effect, Stream } from "effect";
import { PyxisRpcClient } from "../api/rpcClient.js";
import { pyxisRpcRuntime } from "../effect/runtime.js";

export const queueStateStreamAtom = pyxisRpcRuntime.atom(() =>
	Stream.unwrap(
		Effect.gen(function* () {
			const client = yield* PyxisRpcClient;
			return client("queue.state.stream", undefined);
		}),
	),
);
