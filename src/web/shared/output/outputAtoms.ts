import { Effect, Stream } from "effect";
import { PyxisRpcClient } from "../api/rpcClient.js";
import { pyxisRpcRuntime } from "../effect/runtime.js";

export const SONOS_TOPOLOGY_REACTIVITY_KEY = "sonos.topology" as const;

export const outputStateStreamAtom = pyxisRpcRuntime.atom(() =>
  Stream.unwrap(
    Effect.gen(function* () {
      const client = yield* PyxisRpcClient;
      return client("output.state.stream", undefined);
    }),
  ),
);

export const selectBrowserOutputMutationAtom = PyxisRpcClient.mutation(
  "output.browser.select",
);
export const selectSonosOutputMutationAtom = PyxisRpcClient.mutation(
  "output.sonos.select",
);

export const sonosTopologyQueryAtom = PyxisRpcClient.query(
  "sonos.topology.get",
  undefined,
  { reactivityKeys: [SONOS_TOPOLOGY_REACTIVITY_KEY] },
);
export const refreshSonosMutationAtom = PyxisRpcClient.mutation(
  "sonos.discovery.refresh",
);
export const updateSonosGroupMutationAtom = PyxisRpcClient.mutation(
  "sonos.group.update",
);
export const ungroupSonosRoomMutationAtom = PyxisRpcClient.mutation(
  "sonos.room.ungroup",
);
