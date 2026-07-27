import type {
  ApiPlaybackOutputState,
  ApiSelectBrowserOutputInput,
  ApiSelectSonosOutputInput,
} from "@shared/api/contracts/output.js";
import { Context, Effect, Layer } from "effect";
import {
  loadPlaybackOutputSelection,
  savePlaybackOutputSelection,
  type PlaybackOutputSelection,
} from "../../services/outputPersistence.js";
import { PersistenceError, ValidationError } from "../errors.js";
import { Sonos, type SonosShape } from "./sonos.js";

export type PlaybackOutputListener = () => void;

export type OutputShape = {
  readonly getState: Effect.Effect<ApiPlaybackOutputState>;
  readonly selectBrowser: (
    input: ApiSelectBrowserOutputInput,
  ) => Effect.Effect<ApiPlaybackOutputState, PersistenceError>;
  readonly selectSonos: (
    input: ApiSelectSonosOutputInput,
  ) => Effect.Effect<
    ApiPlaybackOutputState,
    PersistenceError | ValidationError
  >;
  readonly acceptsBrowserReport: (clientId: string) => Effect.Effect<boolean>;
  readonly subscribe: (
    listener: PlaybackOutputListener,
  ) => Effect.Effect<() => void>;
};

export class Output extends Context.Service<Output, OutputShape>()(
  "Pyxis/Output",
) {}

export type OutputServiceDeps = {
  readonly initialSelection?: PlaybackOutputSelection;
  readonly now?: () => number;
  readonly save?: (selection: PlaybackOutputSelection) => void;
};

export function makeOutputShape(
  sonos: SonosShape,
  deps: OutputServiceDeps = {},
): OutputShape {
  let selection =
    deps.initialSelection ?? ({ type: "none", updatedAt: 0 } as const);
  const now = deps.now ?? Date.now;
  const save = deps.save ?? savePlaybackOutputSelection;
  const listeners = new Set<PlaybackOutputListener>();

  const resolveState = (): Effect.Effect<ApiPlaybackOutputState> => {
    if (selection.type === "none" || selection.type === "browser") {
      return Effect.succeed(selection);
    }
    const selected = selection;
    return sonos.getTopology.pipe(
      Effect.match({
        onFailure: (): ApiPlaybackOutputState => ({
          type: "sonos",
          roomUuid: selected.roomUuid,
          roomName: null,
          coordinatorUuid: null,
          coordinatorName: null,
          available: false,
          updatedAt: selected.updatedAt,
        }),
        onSuccess: (topology): ApiPlaybackOutputState => {
          const group = topology.groups.find((candidate) =>
            candidate.rooms.some((room) => room.uuid === selected.roomUuid),
          );
          const room = group?.rooms.find(
            (candidate) => candidate.uuid === selected.roomUuid,
          );
          return {
            type: "sonos",
            roomUuid: selected.roomUuid,
            roomName: room?.name ?? null,
            coordinatorUuid: group?.coordinatorUuid ?? null,
            coordinatorName: group?.coordinatorName ?? null,
            available: topology.available && group !== undefined,
            updatedAt: selected.updatedAt,
          };
        },
      }),
    );
  };

  const persist = (
    next: PlaybackOutputSelection,
  ): Effect.Effect<void, PersistenceError> =>
    Effect.try({
      try: () => save(next),
      catch: () => new PersistenceError({ code: "output_selection_save_failed" }),
    });

  const commit = (
    next: PlaybackOutputSelection,
  ): Effect.Effect<ApiPlaybackOutputState, PersistenceError> =>
    persist(next).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          selection = next;
          for (const listener of listeners) listener();
        }),
      ),
      Effect.flatMap(resolveState),
    );

  return {
    getState: Effect.suspend(resolveState),
    selectBrowser: (input) =>
      commit({ type: "browser", clientId: input.clientId, updatedAt: now() }),
    selectSonos: (input) =>
      Effect.gen(function* () {
        const topology = yield* sonos.getTopology.pipe(
          Effect.mapError(
            () =>
              new ValidationError({
                code: "sonos_topology_unavailable",
                field: "roomUuid",
              }),
          ),
        );
        const found = topology.groups.some((group) =>
          group.rooms.some((room) => room.uuid === input.roomUuid),
        );
        if (!found) {
          return yield* Effect.fail(
            new ValidationError({
              code: "sonos_room_not_found",
              field: "roomUuid",
            }),
          );
        }
        return yield* commit({
          type: "sonos",
          roomUuid: input.roomUuid,
          updatedAt: now(),
        });
      }),
    acceptsBrowserReport: (clientId) =>
      Effect.sync(
        () => selection.type === "browser" && selection.clientId === clientId,
      ),
    subscribe: (listener) =>
      Effect.sync(() => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }),
  };
}

export function OutputLayerFromSonos(
  sonos: SonosShape,
  deps: OutputServiceDeps = {},
): Layer.Layer<Output> {
  return Layer.sync(Output)(() => makeOutputShape(sonos, deps));
}

export const OutputLayerLive: Layer.Layer<Output, never, Sonos> = Layer.effect(
  Output,
  Effect.gen(function* () {
    const sonos = yield* Sonos;
    const initialSelection = yield* Effect.sync(() =>
      loadPlaybackOutputSelection(),
    );
    return makeOutputShape(sonos, { initialSelection });
  }),
);
