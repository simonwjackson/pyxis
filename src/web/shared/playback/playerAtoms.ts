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
  PyxisRpcClient.mutation("player.trackEnded");
export const playerPauseMutationAtom = PyxisRpcClient.mutation("player.pause");
export const playerResumeMutationAtom =
  PyxisRpcClient.mutation("player.resume");
export const playerSeekMutationAtom = PyxisRpcClient.mutation("player.seek");
export const playerSkipMutationAtom = PyxisRpcClient.mutation("player.skip");
export const playerPreviousMutationAtom =
  PyxisRpcClient.mutation("player.previous");
export const playerStopMutationAtom = PyxisRpcClient.mutation("player.stop");
export const playerPlayMutationAtom = PyxisRpcClient.mutation("player.play");
export const playerJumpToMutationAtom =
  PyxisRpcClient.mutation("player.jumpTo");
export const clientLogWriteMutationAtom =
  PyxisRpcClient.mutation("log.client.write");
