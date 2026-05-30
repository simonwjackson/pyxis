/**
 * @module player
 * Server-side singleton player state management.
 * Tracks playback status, progress, volume, and coordinates with the queue module.
 * State changes are broadcast to subscribers and persisted to the database.
 */

import { getDb } from "@shared/db/index.js";
import { createLogger } from "@shared/logger.js";
import { generateId } from "../lib/ids.js";
import { loadPlayerState, schedulePlayerSave } from "./persistence.js";
import * as Queue from "./queue.js";

const log = createLogger("playback").child({ component: "player" });

/**
 * Possible playback states for the player.
 * - "playing": Audio is actively playing
 * - "paused": Playback is paused at the current position
 * - "stopped": No track is loaded or playback has ended
 */
export type PlayerStatus = "playing" | "paused" | "stopped";

/**
 * Complete player state snapshot exposed to clients.
 * Contains current track info, playback position, and queue context.
 */
export type PlayerState = {
  /** Current playback status */
  readonly status: PlayerStatus;
  /** Currently playing track, or null if stopped */
  readonly currentTrack: Queue.QueueTrack | null;
  /** Next track in queue for prefetching, or null if none */
  readonly nextTrack: Queue.QueueTrack | null;
  /** Current playback position in seconds */
  readonly progress: number;
  /** Total track duration in seconds */
  readonly duration: number;
  /** Volume level from 0-100 */
  readonly volume: number;
  /** Unix timestamp (ms) of last state update, used for progress calculation */
  readonly updatedAt: number;
  /** Context describing what is being played (radio, album, playlist, manual) */
  readonly queueContext: Queue.QueueContext;
};

/**
 * Callback function type for player state change subscriptions.
 */
type PlayerListener = (state: PlayerState) => void;

// Server-side player state (singleton)
let status: PlayerStatus = "stopped";
let progress = 0;
let duration = 0;
let volume = 100;
let updatedAt = Date.now();
let audioObservedAt: number | null = null;
let audioFailed = false;
let audioError: string | null = null;

const listeners = new Set<PlayerListener>();
let listenLogWriteQueue: Promise<void> = Promise.resolve();

export type AudioRealizationState = {
  readonly observedAt: number | null;
  readonly failed: boolean;
  readonly error: string | null;
};

export function getAudioRealization(): AudioRealizationState {
  return {
    observedAt: audioObservedAt,
    failed: audioFailed,
    error: audioError,
  };
}

function resetAudioRealization(): void {
  audioObservedAt = null;
  audioFailed = false;
  audioError = null;
}

function markAudioObserved(): void {
  audioObservedAt = Date.now();
  audioFailed = false;
  audioError = null;
}

function notify(): void {
  const state = getState();
  const trackId = state.currentTrack?.id ?? "none";
  const nextId = state.nextTrack?.id ?? "none";
  log.info(
    {
      status: state.status,
      track: trackId,
      next: nextId,
      listeners: listeners.size,
    },
    "notify",
  );
  schedulePlayerSave({
    status: state.status,
    progress: state.progress,
    duration: state.duration,
    volume: state.volume,
    updatedAt: state.updatedAt,
  });
  for (const listener of listeners) {
    listener(state);
  }
}

/**
 * Returns the current player state snapshot.
 * Progress is calculated dynamically based on elapsed time since last update when playing.
 *
 * @returns Complete player state including current/next tracks, progress, and queue context
 *
 * @example
 * ```ts
 * const state = getState();
 * const log = createLogger("player");
 * log.info(
 *   { track: state.currentTrack?.title, progress: state.progress },
 *   "now playing",
 * );
 * ```
 */
export function getState(): PlayerState {
  return {
    status,
    currentTrack: Queue.currentTrack() ?? null,
    nextTrack: Queue.nextTrack() ?? null,
    progress: getProgress(),
    duration,
    volume,
    updatedAt,
    queueContext: Queue.getState().context,
  };
}

/**
 * Calculate current progress.
 * When playing, derive from elapsed time since last update.
 * When paused/stopped, return stored progress.
 */
function getProgress(): number {
  if (status === "playing") {
    const elapsed = (Date.now() - updatedAt) / 1000;
    return Math.min(progress + elapsed, duration || Number.MAX_SAFE_INTEGER);
  }
  return progress;
}

const LISTEN_THRESHOLD_SECONDS = 30;

/**
 * Records the outgoing track to the listen log if it was played for >= 30 seconds.
 * Must be called BEFORE state is overwritten in transition functions.
 */
function maybeLogListen(): void {
  const currentTrack = Queue.currentTrack();
  if (!currentTrack) return;

  const currentProgress = getProgress();
  if (currentProgress < LISTEN_THRESHOLD_SECONDS) return;

  const listenEntry = {
    id: generateId(),
    compositeId: currentTrack.id,
    title: currentTrack.title,
    artist: currentTrack.artist,
    album: currentTrack.album,
    source: currentTrack.source,
    listenedAt: Date.now(),
  };

  listenLogWriteQueue = listenLogWriteQueue
    .catch(() => {
      // Previous write failure already logged; keep queue alive.
    })
    .then(async () => {
      try {
        const db = await getDb();
        // ProseQL appendOnly collection: create appends a line to JSONL.
        // Serialize writes because concurrent appends can corrupt the JSONL file.
        await db.listenLog.create(listenEntry).runPromise;
        log.info(
          { track: listenEntry.compositeId, progress: currentProgress },
          "listen logged",
        );
      } catch (err) {
        log.error(
          { err, track: listenEntry.compositeId },
          "failed to log listen",
        );
        throw err;
      }
    });
}

/**
 * Subscribes to player state changes.
 * The listener is called immediately on state changes with the full state snapshot.
 *
 * @param listener - Callback function invoked on each state change
 * @returns Unsubscribe function to remove the listener
 *
 * @example
 * ```ts
 * const log = createLogger("player");
 * const unsubscribe = subscribe((state) => {
 *   log.info({ status: state.status }, "player status changed");
 * });
 * // Later: unsubscribe();
 * ```
 */
export function subscribe(listener: PlayerListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Starts playback, optionally with a new queue of tracks.
 * If tracks and context are provided, replaces the current queue.
 * If no tracks are provided, attempts to play the current queue.
 *
 * @param tracks - Optional array of tracks to play
 * @param context - Required when tracks provided; describes the playback context
 * @param startIndex - Index in the track array to start playing from (default: 0)
 *
 * @example
 * ```ts
 * // Play a new album
 * play(albumTracks, { type: "album", albumId: "abc123" });
 *
 * // Play from specific track in album
 * play(albumTracks, { type: "album", albumId: "abc123" }, 3);
 *
 * // Resume current queue
 * play();
 * ```
 */
export function play(
  tracks?: readonly Queue.QueueTrack[],
  context?: Queue.QueueContext,
  startIndex?: number,
): void {
  log.info(
    { tracks: tracks?.length ?? "none", startIndex: startIndex ?? "none" },
    "play() called",
  );
  if (tracks && context) {
    maybeLogListen();
    Queue.setQueue(tracks, context, startIndex);
  }

  const track = Queue.currentTrack();
  if (!track) {
    status = "stopped";
    progress = 0;
    duration = 0;
    resetAudioRealization();
    updatedAt = Date.now();
    notify();
    return;
  }

  status = "playing";
  progress = 0;
  duration = track.duration ?? 0;
  resetAudioRealization();
  updatedAt = Date.now();
  notify();
}

/**
 * Pauses playback at the current position.
 * No-op if not currently playing.
 */
export function pause(): void {
  log.info({ current: status }, "pause() called");
  if (status !== "playing") return;
  progress = getProgress();
  status = "paused";
  updatedAt = Date.now();
  notify();
}

/**
 * Resumes playback from the paused position.
 * No-op if not currently paused.
 */
export function resume(): void {
  log.info({ current: status }, "resume() called");
  if (status !== "paused") return;
  status = "playing";
  updatedAt = Date.now();
  notify();
}

/**
 * Stops playback and clears the queue.
 * Resets progress and duration to zero.
 */
export function stop(): void {
  maybeLogListen();
  progress = 0;
  duration = 0;
  status = "stopped";
  resetAudioRealization();
  updatedAt = Date.now();
  Queue.clear();
  notify();
}

/**
 * Skips to the next track in the queue.
 * If no next track exists, stops playback.
 *
 * @returns The new current track, or undefined if the queue ended
 */
export function skip(): Queue.QueueTrack | undefined {
  log.info(
    {
      currentIndex: Queue.getState().currentIndex,
      queueLen: Queue.getState().items.length,
    },
    "skip() called",
  );
  maybeLogListen();
  const nextTrack = Queue.next();
  if (!nextTrack) {
    status = "stopped";
    progress = 0;
    duration = 0;
    resetAudioRealization();
    updatedAt = Date.now();
    notify();
    return undefined;
  }

  status = "playing";
  progress = 0;
  duration = nextTrack.duration ?? 0;
  resetAudioRealization();
  updatedAt = Date.now();
  notify();
  return nextTrack;
}

/**
 * Goes back to the previous track in the queue.
 * No-op if already at the first track.
 *
 * @returns The new current track, or undefined if at queue start
 */
export function previousTrack(): Queue.QueueTrack | undefined {
  log.info(
    { currentIndex: Queue.getState().currentIndex },
    "previous() called",
  );
  maybeLogListen();
  const prev = Queue.previous();
  if (!prev) return undefined;

  status = "playing";
  progress = 0;
  duration = prev.duration ?? 0;
  resetAudioRealization();
  updatedAt = Date.now();
  notify();
  return prev;
}

/**
 * Jumps to a specific track in the queue by index.
 *
 * @param index - Zero-based index of the track to play
 * @returns The track at the specified index, or undefined if index is out of bounds
 *
 * @example
 * ```ts
 * const log = createLogger("player");
 * const track = jumpToIndex(5);
 * if (track) {
 *   log.info({ track: track.title }, "jumped to track");
 * }
 * ```
 */
export function jumpToIndex(index: number): Queue.QueueTrack | undefined {
  log.info(
    { index, currentIndex: Queue.getState().currentIndex },
    "jumpTo() called",
  );
  maybeLogListen();
  const track = Queue.jumpTo(index);
  if (!track) return undefined;

  status = "playing";
  progress = 0;
  duration = track.duration ?? 0;
  resetAudioRealization();
  updatedAt = Date.now();
  notify();
  return track;
}

/**
 * Seeks to a specific position in the current track.
 * Position is clamped to valid range [0, duration].
 *
 * @param position - Target position in seconds
 */
export function seek(position: number): void {
  progress = Math.max(0, Math.min(position, duration));
  updatedAt = Date.now();
  notify();
}

/**
 * Sets the playback volume level.
 * Level is clamped to valid range [0, 100].
 *
 * @param level - Volume level from 0 (mute) to 100 (max)
 */
export function setVolume(level: number): void {
  volume = Math.max(0, Math.min(100, level));
  notify();
}

/**
 * Returns true when an `appliesToTrackId` report does not target the
 * currently playing track. Stale reports from a previous track (skip races,
 * double-clicks, late client deliveries) must be dropped so they do not
 * overwrite progress, duration, audio realization, or advance the queue.
 */
function isStaleReport(appliesToTrackId: string | undefined): boolean {
  if (appliesToTrackId === undefined) return false;
  const current = Queue.currentTrack();
  if (!current) return true;
  return current.id !== appliesToTrackId;
}

/**
 * Sets the duration of the current track.
 * Called by the client when actual track duration becomes known.
 *
 * @param d - Track duration in seconds
 * @param appliesToTrackId - Optional opaque track id the report belongs to.
 *   Reports targeting a different current track are dropped silently.
 * @returns `true` when the report was applied, `false` when it was dropped
 *   as stale.
 */
export function setDuration(d: number, appliesToTrackId?: string): boolean {
  if (isStaleReport(appliesToTrackId)) {
    log.debug(
      { appliesToTrackId, current: Queue.currentTrack()?.id ?? "none" },
      "stale duration report ignored",
    );
    return false;
  }
  duration = d;
  markAudioObserved();
  updatedAt = Date.now();
  notify();
  return true;
}

/**
 * Silently updates the server's progress tracking without notifying subscribers.
 * Used by clients to periodically sync their playback position with the server.
 *
 * @param p - Current playback position in seconds as reported by the client
 * @param appliesToTrackId - Optional opaque track id the report belongs to.
 *   Reports targeting a different current track are dropped silently.
 * @returns `true` when the report was applied, `false` when it was dropped
 *   as stale.
 */
export function reportProgress(p: number, appliesToTrackId?: string): boolean {
  if (isStaleReport(appliesToTrackId)) {
    log.debug(
      { appliesToTrackId, current: Queue.currentTrack()?.id ?? "none" },
      "stale progress report ignored",
    );
    return false;
  }
  progress = p;
  markAudioObserved();
  updatedAt = Date.now();
  // No notify — this is a silent update from client to keep server in sync
  return true;
}

export function reportAudioError(
  message: string,
  appliesToTrackId?: string,
): boolean {
  if (isStaleReport(appliesToTrackId)) {
    log.debug(
      { appliesToTrackId, current: Queue.currentTrack()?.id ?? "none" },
      "stale audio error report ignored",
    );
    return false;
  }
  audioFailed = true;
  audioError = message.slice(0, 500);
  audioObservedAt = null;
  updatedAt = Date.now();
  notify();
  return true;
}

/**
 * Called when a track naturally ends on the client.
 * Advances to the next track or stops if the queue is exhausted. A stale
 * `appliesToTrackId` (the client reported the previous track ending after
 * the queue advanced) is dropped without advancing the queue.
 *
 * @param appliesToTrackId - Optional opaque track id the ended report targets.
 * @returns The next track that started playing, or undefined if playback
 *   stopped, the queue ended, or the report was dropped as stale.
 */
export function trackEnded(
  appliesToTrackId?: string,
): Queue.QueueTrack | undefined {
  if (isStaleReport(appliesToTrackId)) {
    log.debug(
      { appliesToTrackId, current: Queue.currentTrack()?.id ?? "none" },
      "stale trackEnded ignored",
    );
    return undefined;
  }
  return skip();
}

/**
 * Restores player and queue state from the database on server startup.
 * Always restores to "paused" status since the server cannot play audio directly.
 * Clients will receive the restored state and can resume playback.
 *
 * @returns True if state was successfully restored, false if no saved state exists
 *
 * @example
 * ```ts
 * // On server startup
 * const log = createLogger("player");
 * const restored = await restoreFromDb();
 * if (restored) {
 *   log.info("playback state restored from previous session");
 * }
 * ```
 */
export async function restoreFromDb(): Promise<boolean> {
  const queueRestored = await Queue.restoreFromDb();
  if (!queueRestored) return false;

  const saved = await loadPlayerState();
  if (saved) {
    // Restore to paused — server can't play audio
    status = "paused";
    progress = saved.progress;
    duration = saved.duration;
    volume = saved.volume;
    updatedAt = Date.now();
  } else {
    // Queue was restored but no player state — set defaults
    const track = Queue.currentTrack();
    status = "paused";
    progress = 0;
    duration = track?.duration ?? 0;
    volume = 100;
    updatedAt = Date.now();
  }

  notify();
  return true;
}
