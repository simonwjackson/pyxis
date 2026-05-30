/**
 * @module server/rpc/handlers/queue
 * Effect RPC handlers for the `queue.*` family, including the snapshot-first
 * `queue.state.stream` realtime contract.
 *
 * Behavior preserved from `server/routers/queue.ts`:
 *
 * - Commands return the encoded {@link ApiQueueState} for the same
 *   serialization shape (`items` w/ display metadata only, `currentIndex`,
 *   `context`).
 * - `queue.state.stream` emits the current queue on subscribe (snapshot
 *   first, no historical replay), then one snapshot per queue state change.
 * - Stream cancellation removes the underlying singleton listener via an
 *   {@link Effect.addFinalizer} so aborted browser streams do not leak
 *   subscriptions.
 */

import { Effect, Queue as EffectQueue, Stream } from "effect";
import type {
  ApiQueueAddInput,
  ApiQueueIndexInput,
  ApiQueueState,
} from "../../../src/api/contracts/queue.js";
import { createLogger } from "../../../src/logger.js";
import { resolveTrackSource } from "../../lib/ids.js";
import type { QueueState, QueueTrack } from "../../services/queue.js";
import { publicHandler } from "../handler.js";
import type { QueueShape } from "../services/queue.js";

const log = createLogger("playback").child({ component: "rpc:queue" });

export type QueueHandlerDeps = {
  readonly queue: QueueShape;
};

/**
 * Encode a raw {@link QueueState} into the wire {@link ApiQueueState}.
 * Mirrors `serializeQueueState` from the legacy router: exposes display
 * metadata only, omitting per-track source backend identifiers.
 */
export function serializeQueueState(state: QueueState): ApiQueueState {
  return {
    items: state.items.map((track) => ({
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      duration: track.duration,
      artworkUrl: track.artworkUrl,
    })),
    currentIndex: state.currentIndex,
    context: state.context,
  };
}

async function attachSource(
  track: ApiQueueAddInput["tracks"][number],
): Promise<QueueTrack> {
  const source = await resolveTrackSource(track.id);
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    duration: track.duration,
    artworkUrl: track.artworkUrl,
    source,
  };
}

export const queueHandlers = (deps: QueueHandlerDeps) => ({
  "queue.state.get": () =>
    publicHandler(deps.queue.getState.pipe(Effect.map(serializeQueueState))),

  "queue.tracks.add": (payload: ApiQueueAddInput) =>
    publicHandler(
      Effect.gen(function* () {
        const resolved = yield* Effect.tryPromise({
          try: () => Promise.all(payload.tracks.map(attachSource)),
          catch: (cause) => cause,
        });
        const insertNext = payload.insertNext;
        const state =
          insertNext !== undefined
            ? yield* deps.queue.addTracks(resolved, insertNext)
            : yield* deps.queue.addTracks(resolved);
        return serializeQueueState(state);
      }),
    ),

  "queue.track.remove": (payload: ApiQueueIndexInput) =>
    publicHandler(
      deps.queue
        .removeTrack(payload.index)
        .pipe(Effect.map(serializeQueueState)),
    ),

  "queue.clear": () =>
    publicHandler(deps.queue.clear.pipe(Effect.map(serializeQueueState))),

  "queue.jump": (payload: ApiQueueIndexInput) =>
    publicHandler(
      deps.queue.jumpTo(payload.index).pipe(Effect.map(serializeQueueState)),
    ),

  "queue.shuffle": () =>
    publicHandler(deps.queue.shuffle.pipe(Effect.map(serializeQueueState))),

  /**
   * Snapshot-first realtime queue stream.
   *
   * 1. Emit current queue on subscribe.
   * 2. Subscribe to the singleton listener list; emit one snapshot per
   *    queue mutation (add, remove, clear, jump, shuffle, radio
   *    auto-fetch).
   * 3. Unsubscribe on scope close so aborted streams do not leak listeners.
   */
  "queue.state.stream": () =>
    Stream.callback<ApiQueueState>((mailbox) =>
      Effect.gen(function* () {
        const emit = (state: QueueState) => {
          EffectQueue.offerUnsafe(mailbox, serializeQueueState(state));
        };

        const initial = yield* deps.queue.getState;
        emit(initial);
        log.info(
          { index: initial.currentIndex, len: initial.items.length },
          "queue stream initial snapshot",
        );

        const unsubscribe = yield* deps.queue.subscribe(emit);

        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            unsubscribe();
            log.debug({}, "queue stream subscription torn down");
          }),
        );
      }),
    ),
});
