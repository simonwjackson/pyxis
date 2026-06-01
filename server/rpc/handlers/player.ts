/**
 * @module server/rpc/handlers/player
 * Effect RPC handlers for the `player.*` family, including the snapshot-first
 * `player.state.stream` realtime contract.
 *
 * Behavior preserved from `server/routers/player.ts`:
 *
 * - Every command returns the encoded {@link ApiPlayerState} for the same
 *   serialization shape (`status`, `currentTrack` w/ `/stream/` URL +
 *   prefetch hint, `progress`, `duration`, `volume`, `updatedAt`).
 * - `player.state.stream` emits the current state immediately on subscribe
 *   (snapshot-first, no historical replay), then emits one snapshot per
 *   player state transition.
 * - A periodic heartbeat snapshot (matching the legacy 5s SSE keepalive) is
 *   emitted so idle connections stay alive and clients observe fresh
 *   progress without explicit reports.
 * - Stream cancellation removes the underlying singleton listener and stops
 *   the heartbeat fiber via `Effect.addFinalizer` so aborted connections do
 *   not leak subscriptions.
 * - Stale `appliesToTrackId` progress/duration/audio-error/track-ended
 *   reports become typed no-op outcomes at the service layer; the handlers
 *   surface them as the current state (or `ok: true`) so retried clients
 *   never overwrite the newly current track.
 */

import type {
  ApiJumpToIndexInput,
  ApiPlayerState,
  ApiPlayInput,
  ApiPlayTrackInput,
  ApiReportAudioErrorInput,
  ApiReportDurationInput,
  ApiReportProgressInput,
  ApiSeekInput,
  ApiTrackEndedInput,
  ApiVolumeInput,
} from "@shared/api/contracts/player.js";
import { createLogger } from "@shared/logger.js";
import { Effect, Queue as EffectQueue, Stream } from "effect";
import {
  buildStreamUrl,
  resolveTrackForStream,
  resolveTrackSource,
} from "../../lib/ids.js";
import { toPlayerStateView } from "../../lib/playerStateView.js";
import type { PlayerState } from "../../services/player.js";
import type { QueueTrack } from "../../services/queue.js";
import { publicHandler } from "../handler.js";
import type { PlayerShape } from "../services/player.js";
import type { QueueShape } from "../services/queue.js";

const log = createLogger("playback").child({ component: "rpc:player" });

/** Heartbeat interval for the realtime player stream, matching the legacy SSE keepalive. */
const PLAYER_STREAM_HEARTBEAT_MS = 5000;

export type PlayerHandlerDeps = {
  readonly player: PlayerShape;
  readonly queue: QueueShape;
};

/**
 * Encode a raw {@link PlayerState} into the wire {@link ApiPlayerState}.
 * Mirrors `serializePlayerState` from the legacy router: composes the
 * `/stream/` URL with the optional `next=` prefetch hint, drops internal
 * source metadata, and exposes only the public projection.
 */
export function serializePlayerState(state: PlayerState): ApiPlayerState {
  const view = toPlayerStateView(state);
  const nextTrack = state.nextTrack;
  return {
    status: view.status,
    currentTrack: view.currentTrack
      ? {
          ...view.currentTrack,
          streamUrl: buildStreamUrl(view.currentTrack.id, nextTrack?.id),
        }
      : null,
    progress: view.progress,
    duration: view.duration,
    volume: state.volume,
    updatedAt: view.updatedAt,
  };
}

async function attachSource(track: ApiPlayTrackInput): Promise<QueueTrack> {
  const [source, id] = await Promise.all([
    resolveTrackSource(track.id),
    resolveTrackForStream(track.id),
  ]);
  return {
    id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    duration: track.duration,
    artworkUrl: track.artworkUrl,
    source,
  };
}

export const playerHandlers = (deps: PlayerHandlerDeps) => ({
  "player.state.get": () =>
    publicHandler(deps.player.getState.pipe(Effect.map(serializePlayerState))),

  "player.transport.play": (payload: ApiPlayInput) =>
    publicHandler(
      Effect.gen(function* () {
        const tracks = payload.tracks;
        const context = payload.context;
        if (tracks && context) {
          const resolved = yield* Effect.tryPromise({
            try: () => Promise.all(tracks.map(attachSource)),
            catch: (cause) => cause,
          });
          const startIndex = payload.startIndex;
          const state =
            startIndex !== undefined
              ? yield* deps.player.play(resolved, context, startIndex)
              : yield* deps.player.play(resolved, context);
          return serializePlayerState(state);
        }
        const state = yield* deps.player.play();
        return serializePlayerState(state);
      }),
    ),

  "player.transport.pause": () =>
    publicHandler(deps.player.pause.pipe(Effect.map(serializePlayerState))),

  "player.transport.resume": () =>
    publicHandler(deps.player.resume.pipe(Effect.map(serializePlayerState))),

  "player.transport.stop": () =>
    publicHandler(deps.player.stop.pipe(Effect.map(serializePlayerState))),

  "player.transport.skip": () =>
    publicHandler(deps.player.skip.pipe(Effect.map(serializePlayerState))),

  "player.transport.previous": () =>
    publicHandler(deps.player.previous.pipe(Effect.map(serializePlayerState))),

  "player.transport.jumpTo": (payload: ApiJumpToIndexInput) =>
    publicHandler(
      deps.player.jumpTo(payload.index).pipe(Effect.map(serializePlayerState)),
    ),

  "player.transport.seek": (payload: ApiSeekInput) =>
    publicHandler(
      deps.player.seek(payload.position).pipe(Effect.map(serializePlayerState)),
    ),

  "player.volume.set": (payload: ApiVolumeInput) =>
    publicHandler(
      deps.player
        .setVolume(payload.level)
        .pipe(Effect.map(serializePlayerState)),
    ),

  "player.progress.report": (payload: ApiReportProgressInput) =>
    publicHandler(
      deps.player
        .reportProgress(payload.progress, payload.appliesToTrackId)
        .pipe(Effect.map(() => ({ ok: true as const }))),
    ),

  "player.duration.report": (payload: ApiReportDurationInput) =>
    publicHandler(
      deps.player
        .setDuration(payload.duration, payload.appliesToTrackId)
        .pipe(Effect.map(() => ({ ok: true as const }))),
    ),

  "player.audioError.report": (payload: ApiReportAudioErrorInput) =>
    publicHandler(
      deps.player
        .reportAudioError(payload.message, payload.appliesToTrackId)
        .pipe(Effect.map(() => ({ ok: true as const }))),
    ),

  "player.transport.trackEnded": (payload: ApiTrackEndedInput) =>
    publicHandler(
      deps.player
        .trackEnded(payload.appliesToTrackId)
        .pipe(Effect.map(serializePlayerState)),
    ),

  /**
   * Snapshot-first realtime player stream.
   *
   * 1. Emit the current player state on subscribe.
   * 2. Subscribe to the singleton listener list; emit one snapshot per
   *    state transition.
   * 3. Fork a heartbeat fiber that emits the current state every
   *    {@link PLAYER_STREAM_HEARTBEAT_MS} so idle clients still observe
   *    fresh progress/durations without explicit reports.
   * 4. On scope close (stream cancellation, transport disconnect, client
   *    abort), interrupt the heartbeat fiber and call the unsubscribe
   *    returned by {@link PlayerShape.subscribe}.
   */
  "player.state.stream": () =>
    Stream.callback<ApiPlayerState>((mailbox) =>
      Effect.gen(function* () {
        const emit = (state: PlayerState) => {
          EffectQueue.offerUnsafe(mailbox, serializePlayerState(state));
        };

        // 1. Snapshot-first emit so clients have current state immediately.
        const initial = yield* deps.player.getState;
        emit(initial);
        log.info(
          {
            status: initial.status,
            track: initial.currentTrack?.id ?? "none",
          },
          "player stream initial snapshot",
        );

        // 2. Live subscription to state transitions.
        const unsubscribe = yield* deps.player.subscribe(emit);

        // 3. Cleanup on scope close: the singleton listener is removed so
        //    aborted browser streams and disconnected transports cannot
        //    leak subscriptions.
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            unsubscribe();
            log.debug({}, "player stream subscription torn down");
          }),
        );

        // 4. Heartbeat: re-emit current snapshot to keep idle connections
        //    warm and reflect dynamic progress without client reports.
        //    The first emission waits one interval so it does not collide
        //    with the snapshot-first emit above. `forkScoped` attaches the
        //    fiber to the stream's scope so it is interrupted when the
        //    stream closes — no manual fiber bookkeeping required.
        yield* Effect.gen(function* () {
          yield* Effect.sleep(`${PLAYER_STREAM_HEARTBEAT_MS} millis`);
          const current = yield* deps.player.getState;
          emit(current);
        }).pipe(Effect.forever, Effect.forkScoped);
      }),
    ),
});
