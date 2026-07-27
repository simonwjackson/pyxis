import type {
  ApiSonosGroupUpdateInput,
  ApiSonosRoomInput,
} from "@shared/api/contracts/sonos.js";
import type { AppConfig } from "@shared/config.js";
import { Context, Effect, Layer } from "effect";
import { getAppConfig } from "../../services/sourceManager.js";
import {
  discoverSonosTopology,
  type SonosDiscoveryDeps,
} from "../../sonos/discovery.js";
import { planSonosGroupUpdate } from "../../sonos/groupPlan.js";
import type { SonosRoom, SonosTopology } from "../../sonos/model.js";
import { joinSonosGroup, leaveSonosGroup } from "../../sonos/transport.js";
import { SourceUnavailable } from "../errors.js";

export type SonosShape = {
  readonly getTopology: Effect.Effect<SonosTopology, SourceUnavailable>;
  readonly refresh: Effect.Effect<SonosTopology, SourceUnavailable>;
  readonly updateGroup: (
    input: ApiSonosGroupUpdateInput,
  ) => Effect.Effect<SonosTopology, SourceUnavailable>;
  readonly ungroupRoom: (
    input: ApiSonosRoomInput,
  ) => Effect.Effect<SonosTopology, SourceUnavailable>;
};

export type SonosServiceDeps = SonosDiscoveryDeps & {
  readonly joinGroup?: (
    room: SonosRoom,
    coordinatorUuid: string,
  ) => Promise<void>;
  readonly leaveGroup?: (room: SonosRoom) => Promise<void>;
  readonly waitAfterMutation?: () => Promise<void>;
};

export class Sonos extends Context.Service<Sonos, SonosShape>()(
  "Pyxis/Sonos",
) {}

export function sonosGroupMatches(
  topology: SonosTopology,
  coordinatorUuid: string,
  memberUuids: readonly string[],
): boolean {
  const desired = new Set(memberUuids);
  const group = topology.groups.find(
    (candidate) => candidate.coordinatorUuid === coordinatorUuid,
  );
  return (
    group !== undefined &&
    group.rooms.length === desired.size &&
    group.rooms.every((room) => desired.has(room.uuid))
  );
}

export function sonosRoomIsStandalone(
  topology: SonosTopology,
  roomUuid: string,
): boolean {
  const group = topology.groups.find((candidate) =>
    candidate.rooms.some((room) => room.uuid === roomUuid),
  );
  return group?.coordinatorUuid === roomUuid && group.rooms.length === 1;
}

export function makeSonosShape(
  config: AppConfig["sonos"],
  deps: SonosServiceDeps = {},
): SonosShape {
  let cached: SonosTopology | undefined;
  let refreshPromise: Promise<SonosTopology> | undefined;
  let mutationChain: Promise<void> = Promise.resolve();
  const fetchImpl = deps.fetch ?? fetch;
  const joinGroup =
    deps.joinGroup ??
    ((room: SonosRoom, coordinatorUuid: string) =>
      joinSonosGroup(
        room,
        coordinatorUuid,
        config.requestTimeoutMs,
        fetchImpl,
      ));
  const leaveGroup =
    deps.leaveGroup ??
    ((room: SonosRoom) =>
      leaveSonosGroup(room, config.requestTimeoutMs, fetchImpl));
  const waitAfterMutation =
    deps.waitAfterMutation ??
    (() => new Promise<void>((resolve) => setTimeout(resolve, 300)));

  const runRefresh = (): Promise<SonosTopology> => {
    if (!refreshPromise) {
      refreshPromise = discoverSonosTopology(config, deps).finally(() => {
        refreshPromise = undefined;
      });
    }
    return refreshPromise.then((topology) => {
      cached = topology;
      return topology;
    });
  };

  const refresh = Effect.tryPromise({
    try: runRefresh,
    catch: () => new SourceUnavailable({ code: "sonos_discovery_failed" }),
  });

  const refreshUntil = async (
    predicate: (topology: SonosTopology) => boolean,
  ): Promise<SonosTopology> => {
    let latest: SonosTopology | undefined;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      latest = await runRefresh();
      if (predicate(latest)) return latest;
      await waitAfterMutation();
    }
    throw new Error("Sonos topology did not converge after group update");
  };

  const runMutation = (
    operation: () => Promise<SonosTopology>,
  ): Effect.Effect<SonosTopology, SourceUnavailable> =>
    Effect.tryPromise({
      try: () => {
        const result = mutationChain.then(operation, operation);
        mutationChain = result.then(
          () => undefined,
          () => undefined,
        );
        return result;
      },
      catch: () => new SourceUnavailable({ code: "sonos_group_update_failed" }),
    });

  const shape: SonosShape = {
    refresh,
    getTopology: Effect.suspend(() => {
      const maxAgeMs = config.discoveryIntervalSeconds * 1000;
      const isFresh =
        cached?.refreshedAt !== null &&
        cached?.refreshedAt !== undefined &&
        (deps.now ?? Date.now)() - cached.refreshedAt < maxAgeMs;
      return isFresh && cached !== undefined ? Effect.succeed(cached) : refresh;
    }),
    updateGroup: (input) =>
      runMutation(async () => {
        const topology = await runRefresh();
        const operations = planSonosGroupUpdate(
          topology,
          input.coordinatorUuid,
          input.memberUuids,
        );
        for (const operation of operations) {
          if (operation.type === "leave") {
            await leaveGroup(operation.room);
          } else {
            await joinGroup(operation.room, operation.coordinatorUuid);
          }
          await waitAfterMutation();
        }
        cached = undefined;
        return refreshUntil((candidate) =>
          sonosGroupMatches(
            candidate,
            input.coordinatorUuid,
            input.memberUuids,
          ),
        );
      }),
    ungroupRoom: (input) =>
      runMutation(async () => {
        const topology = await runRefresh();
        const group = topology.groups.find((candidate) =>
          candidate.rooms.some((room) => room.uuid === input.roomUuid),
        );
        const room = group?.rooms.find(
          (candidate) => candidate.uuid === input.roomUuid,
        );
        if (!group || !room) throw new Error("Sonos room was not found");
        if (group.rooms.length === 1) return topology;
        await leaveGroup(room);
        await waitAfterMutation();
        cached = undefined;
        return refreshUntil((candidate) =>
          sonosRoomIsStandalone(candidate, input.roomUuid),
        );
      }),
  };
  return shape;
}

export function SonosLayerFromConfig(
  config: AppConfig["sonos"],
  deps: SonosServiceDeps = {},
): Layer.Layer<Sonos> {
  return Layer.sync(Sonos)(() => makeSonosShape(config, deps));
}

export const SonosLayerLive: Layer.Layer<Sonos> = Layer.sync(Sonos)(() => {
  const config = getAppConfig()?.sonos;
  return makeSonosShape(
    config ?? {
      enabled: false,
      lanStreamBaseUrl: undefined,
      seedHosts: [],
      discoveryIntervalSeconds: 30,
      pollIntervalMs: 1000,
      requestTimeoutMs: 3000,
    },
  );
});
