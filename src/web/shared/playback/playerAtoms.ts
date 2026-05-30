/**
 * @module @app/web/shared/playback/playerAtoms
 *
 * Effect atom seams for player commands/realtime state. The hook owns DOM
 * audio behavior; this module owns the RPC boundary.
 */

import { Effect, Stream } from "effect";
import { PyxisRpcClient } from "../api/rpcClient.js";
import { pyxisRpcRuntime } from "../effect/runtime.js";

export const playerStateStreamAtom = pyxisRpcRuntime.atom(() =>
  Stream.unwrap(
    Effect.gen(function* () {
      const client = yield* PyxisRpcClient;
      return client("player.state.stream", undefined);
    }),
  ),
);

export const playerProgressReportMutationAtom = PyxisRpcClient.mutation(
  "player.progress.report",
);
export const playerDurationReportMutationAtom = PyxisRpcClient.mutation(
  "player.duration.report",
);
export const playerAudioErrorReportMutationAtom = PyxisRpcClient.mutation(
  "player.audioError.report",
);
export const playerTrackEndedMutationAtom =
  PyxisRpcClient.mutation("player.transport.trackEnded");
export const playerPauseMutationAtom = PyxisRpcClient.mutation("player.transport.pause");
export const playerResumeMutationAtom =
  PyxisRpcClient.mutation("player.transport.resume");
export const playerSeekMutationAtom = PyxisRpcClient.mutation("player.transport.seek");
export const playerSkipMutationAtom = PyxisRpcClient.mutation("player.transport.skip");
export const playerPreviousMutationAtom =
  PyxisRpcClient.mutation("player.transport.previous");
export const playerStopMutationAtom = PyxisRpcClient.mutation("player.transport.stop");
export const playerPlayMutationAtom = PyxisRpcClient.mutation("player.transport.play");
export const playerJumpToMutationAtom =
  PyxisRpcClient.mutation("player.transport.jumpTo");
export const clientLogWriteMutationAtom =
  PyxisRpcClient.mutation("log.client.write");
