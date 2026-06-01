/**
 * @module usePlayback
 * Audio playback hook with server synchronization.
 * Manages HTML Audio element and syncs state with server via SSE subscriptions.
 */

import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/unstable/reactivity";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiPlayerState } from "../../../api/contracts/player.js";
import {
  BrowserAudio,
  type BrowserAudio as BrowserAudioAdapter,
} from "./browserAudio";
import {
  type PlaybackAudioAction,
  type PlaybackServerStateSource,
  type PlaybackStatePatch,
  reconcilePlaybackState,
} from "./playbackReconciliation";
import {
  clientLogWriteMutationAtom,
  playerAudioErrorReportMutationAtom,
  playerDurationReportMutationAtom,
  playerPauseMutationAtom,
  playerPlayMutationAtom,
  playerPreviousMutationAtom,
  playerProgressReportMutationAtom,
  playerResumeMutationAtom,
  playerSeekMutationAtom,
  playerSkipMutationAtom,
  playerStateStreamAtom,
  playerStopMutationAtom,
  playerTrackEndedMutationAtom,
} from "./playerAtoms";
import type {
  PlaybackContextValue,
  PlaybackQueueContext,
  PlaybackQueueRequest,
  PlaybackState,
  PlaybackTrack,
} from "./types";

/**
 * Internal playback state.
 */
type InternalPlaybackState = {
  /** Currently playing track, or null if stopped */
  readonly currentTrack: PlaybackTrack | null;
  /** Current station token (for Pandora radio context) */
  readonly currentStationToken: string | null;
  /** Whether audio is currently playing */
  readonly isPlaying: boolean;
  /** Current playback position in seconds */
  readonly progress: number;
  /** Total track duration in seconds */
  readonly duration: number;
  /** Error message if playback failed, null otherwise */
  readonly error: string | null;
  /** Volume level from 0-100 */
  readonly volume: number;
};

const applyPlaybackStatePatch = (
  state: InternalPlaybackState,
  patch: PlaybackStatePatch,
): InternalPlaybackState => ({
  ...state,
  currentTrack: patch.currentTrack,
  isPlaying: patch.isPlaying,
  progress: patch.progress ?? state.progress,
  duration: patch.duration ?? state.duration,
  volume: patch.volume ?? state.volume,
});

/**
 * Main playback hook providing audio controls and server synchronization.
 * Manages HTML Audio element lifecycle, SSE state subscriptions, and server mutations.
 *
 * @returns Playback state and control functions
 *
 * @example
 * ```tsx
 * const { isPlaying, togglePlayPause, currentTrack, seek } = usePlayback();
 * ```
 */
function getCurrentStationToken(context: PlaybackQueueContext): string | null {
  switch (context.type) {
    case "radio":
      return context.seedId;
    case "album":
      return context.albumId;
    case "playlist":
      return context.playlistId;
    case "manual":
      return null;
  }
}

export function usePlayback(): PlaybackContextValue {
  const audioRef = useRef<BrowserAudioAdapter | null>(null);
  const [state, setState] = useState<InternalPlaybackState>({
    currentTrack: null,
    currentStationToken: null,
    isPlaying: false,
    progress: 0,
    duration: 0,
    error: null,
    volume: 100,
  });

  // Track the last stream URL to avoid reloading same track
  const lastStreamUrlRef = useRef<string | null>(null);
  const seekingRef = useRef(false);
  const handleServerStateRef = useRef<
    (state: ServerState, source?: PlaybackServerStateSource) => void
  >(() => {});
  // Track whether we've handled the first SSE state after page load.
  // We only suppress autoplay for a newly loaded track during that first sync,
  // not on later reconnects for the same session.
  const hasReceivedInitialStateRef = useRef(false);
  // Track the latest server progress for seek-on-resume
  const serverProgressRef = useRef(0);

  type ServerState = ApiPlayerState;

  const playerStateResult = useAtomValue(playerStateStreamAtom);
  const reportProgress = useAtomSet(playerProgressReportMutationAtom, {
    mode: "promiseExit",
  });
  const reportDuration = useAtomSet(playerDurationReportMutationAtom, {
    mode: "promiseExit",
  });
  const reportAudioError = useAtomSet(playerAudioErrorReportMutationAtom, {
    mode: "promiseExit",
  });
  const trackEnded = useAtomSet(playerTrackEndedMutationAtom, {
    mode: "promiseExit",
  });
  const clientLogWrite = useAtomSet(clientLogWriteMutationAtom, {
    mode: "promiseExit",
  });

  /** Fire-and-forget log to server playback.log */
  const logToServer = useCallback(
    (message: string) => {
      void clientLogWrite({ payload: { message } });
    },
    [clientLogWrite],
  );

  // Initialize audio element once
  useEffect(() => {
    const audio = BrowserAudio.create();
    audioRef.current = audio;

    const onTimeUpdate = () => {
      if (!seekingRef.current) {
        setState((prev) => ({
          ...prev,
          progress: audio.snapshot().currentTime,
        }));
      }
    };
    const onDurationChange = () => {
      const duration = audio.getDuration();
      setState((prev) => ({ ...prev, duration }));
      void reportDuration({ payload: { duration } });
    };
    const onEnded = () => {
      logToServer("[audio] track ended, calling trackEnded mutation");
      setState((prev) => ({ ...prev, isPlaying: false }));
      void trackEnded({ payload: {} }).then((exit) => {
        if (exit._tag === "Success") {
          handleServerStateRef.current(exit.value, "trackEnded-response");
        }
      });
    };
    const onError = () => {
      const mediaError = audio.getError();
      const src = audio.snapshot().src;
      // MEDIA_ERR_ABORTED is expected during track transitions (src changed while loading)
      if (mediaError?.code === BrowserAudio.mediaErrorAborted) {
        logToServer(
          `[audio] MEDIA_ERR_ABORTED silenced (transition expected) src=${src}`,
        );
        return;
      }
      const message = BrowserAudio.describeError(mediaError);
      logToServer(
        `[audio] error code=${mediaError?.code ?? "unknown"} message=${message} src=${src}`,
      );
      void reportAudioError({ payload: { message } });
      setState((prev) => ({
        ...prev,
        isPlaying: false,
        error: message,
      }));
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      audio.pause();
    };
  }, [logToServer, reportAudioError, reportDuration, trackEnded]);

  /** Safely call audio.play() with standard error handling */
  const safePlay = useCallback(
    (audio: BrowserAudioAdapter, context: string) => {
      audio.play().catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") {
          logToServer(`[audio] play() AbortError silenced (${context})`);
          return;
        }
        if (err instanceof DOMException && err.name === "NotAllowedError") {
          logToServer(`[audio] play() blocked by autoplay policy (${context})`);
          setState((prev) => ({ ...prev, isPlaying: false }));
          return;
        }
        const message = err instanceof Error ? err.message : "Playback failed";
        logToServer(`[audio] play() rejected (${context}): ${message}`);
        void reportAudioError({ payload: { message } });
        setState((prev) => ({
          ...prev,
          isPlaying: false,
          error: message,
        }));
      });
    },
    [logToServer, reportAudioError],
  );

  const executeAudioAction = useCallback(
    (audio: BrowserAudioAdapter, action: PlaybackAudioAction) => {
      const handlers = {
        Load: (load: Extract<PlaybackAudioAction, { _tag: "Load" }>) => {
          audio.setSrc(load.src);
        },
        Seek: (seek: Extract<PlaybackAudioAction, { _tag: "Seek" }>) => {
          if (seek.when === "now") {
            audio.setCurrentTime(seek.position);
            return;
          }
          const onCanPlay = () => {
            audio.removeEventListener("canplay", onCanPlay);
            audio.setCurrentTime(seek.position);
          };
          audio.addEventListener("canplay", onCanPlay);
        },
        Play: (play: Extract<PlaybackAudioAction, { _tag: "Play" }>) => {
          safePlay(audio, play.context);
        },
        Pause: () => {
          audio.pause();
        },
        ResetTime: () => {
          audio.setCurrentTime(0);
        },
        SetVolume: (
          setVolume: Extract<PlaybackAudioAction, { _tag: "SetVolume" }>,
        ) => {
          audio.setVolume(setVolume.volume);
        },
      };

      handlers[action._tag](action as never);
    },
    [safePlay],
  );

  // Shared handler for server player state — called from both SSE and mutation responses
  const handleServerState = useCallback(
    (serverState: ServerState, source: PlaybackServerStateSource = "sse") => {
      const audio = audioRef.current;
      if (!audio) return;

      const isInitialState =
        source === "sse" && !hasReceivedInitialStateRef.current;

      logToServer(
        `[${source}] received status=${serverState.status} track=${serverState.currentTrack?.id ?? "none"} progress=${String(serverState.progress)} initial=${String(isInitialState)}`,
      );

      const reconciliation = reconcilePlaybackState({
        serverState,
        source,
        audio: audio.snapshot(),
        lastStreamUrl: lastStreamUrlRef.current,
        hasReceivedInitialState: hasReceivedInitialStateRef.current,
        haveMetadata: BrowserAudio.haveMetadata,
      });

      serverProgressRef.current = reconciliation.serverProgress;
      lastStreamUrlRef.current = reconciliation.nextLastStreamUrl;
      hasReceivedInitialStateRef.current =
        reconciliation.nextHasReceivedInitialState;

      for (const message of reconciliation.logs) {
        logToServer(message);
      }
      for (const action of reconciliation.actions) {
        executeAudioAction(audio, action);
      }

      setState((prev) =>
        applyPlaybackStatePatch(prev, reconciliation.statePatch),
      );
    },
    [executeAudioAction, logToServer],
  );

  // Keep ref in sync so audio event listeners always call the latest version
  handleServerStateRef.current = handleServerState;

  // Subscribe to server player state changes through Effect RPC. The atom
  // runtime owns stream connection lifecycle and republishes the latest state.
  useEffect(() => {
    if (AsyncResult.isSuccess(playerStateResult)) {
      handleServerState(playerStateResult.value, "sse");
    }
  }, [playerStateResult, handleServerState]);

  // Periodically report progress to server (every 5s while playing)
  useEffect(() => {
    if (!state.isPlaying) return;
    const interval = setInterval(() => {
      const audio = audioRef.current;
      if (!audio) return;
      const snapshot = audio.snapshot();
      if (!snapshot.paused) {
        void reportProgress({ payload: { progress: snapshot.currentTime } });
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [state.isPlaying, reportProgress]);

  // --- Server mutation wrappers ---
  const pause = useAtomSet(playerPauseMutationAtom, { mode: "promiseExit" });
  const resume = useAtomSet(playerResumeMutationAtom, { mode: "promiseExit" });
  const seekRemote = useAtomSet(playerSeekMutationAtom, {
    mode: "promiseExit",
  });
  const skip = useAtomSet(playerSkipMutationAtom, { mode: "promiseExit" });
  const previous = useAtomSet(playerPreviousMutationAtom, {
    mode: "promiseExit",
  });
  const stopRemote = useAtomSet(playerStopMutationAtom, {
    mode: "promiseExit",
  });
  const playRemote = useAtomSet(playerPlayMutationAtom, {
    mode: "promiseExit",
  });

  const togglePlayPause = useCallback(() => {
    if (state.isPlaying) {
      logToServer("[action] togglePlayPause → pause");
      const audio = audioRef.current;
      if (audio) {
        serverProgressRef.current = audio.snapshot().currentTime;
        audio.pause();
      }
      setState((prev) => ({ ...prev, isPlaying: false }));
      void pause({ payload: undefined });
    } else {
      logToServer("[action] togglePlayPause → resume");
      const audio = audioRef.current;
      if (audio) {
        // Seek to server progress before playing — handles handoff from another device
        const snapshot = audio.snapshot();
        const delta = Math.abs(
          snapshot.currentTime - serverProgressRef.current,
        );
        if (delta > 2) {
          logToServer(
            `[action] seek before resume: ${String(snapshot.currentTime)}→${String(serverProgressRef.current)} (delta=${String(delta)})`,
          );
          audio.setCurrentTime(serverProgressRef.current);
        }
        safePlay(audio, "togglePlayPause resume");
      }
      setState((prev) => ({ ...prev, isPlaying: true }));
      void resume({ payload: undefined });
    }
  }, [state.isPlaying, pause, resume, logToServer, safePlay]);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.setCurrentTime(0);
    }
    lastStreamUrlRef.current = null;
    setState((prev) => ({
      ...prev,
      currentTrack: null,
      currentStationToken: null,
      isPlaying: false,
      progress: 0,
      duration: 0,
      error: null,
    }));
    void stopRemote({ payload: undefined });
  }, [stopRemote]);

  const seek = useCallback(
    (time: number) => {
      const audio = audioRef.current;
      if (audio) {
        seekingRef.current = true;
        audio.setCurrentTime(time);
        setState((prev) => ({ ...prev, progress: time }));
        void seekRemote({ payload: { position: time } });
        setTimeout(() => {
          seekingRef.current = false;
        }, 200);
      }
    },
    [seekRemote],
  );

  const setCurrentStationToken = useCallback((token: string | null) => {
    setState((prev) => ({ ...prev, currentStationToken: token }));
  }, []);

  const triggerSkip = useCallback(() => {
    logToServer("[action] skip");
    void skip({ payload: undefined }).then((exit) => {
      if (exit._tag === "Success") {
        handleServerState(exit.value, "skip-response");
      }
    });
  }, [skip, logToServer, handleServerState]);

  const triggerPrevious = useCallback(() => {
    logToServer("[action] previous");
    void previous({ payload: undefined }).then((exit) => {
      if (exit._tag === "Success") {
        handleServerState(exit.value, "prev-response");
      }
    });
  }, [previous, logToServer, handleServerState]);

  const playTrack = useCallback(
    (track: PlaybackTrack) => {
      logToServer(
        `[action] playTrack id=${track.trackToken} url=${track.audioUrl}`,
      );
      const audio = audioRef.current;
      if (!audio) return;
      audio.setSrc(track.audioUrl);
      lastStreamUrlRef.current = track.audioUrl;
      audio.play().catch((err: unknown) => {
        // AbortError is expected when src changes during play()
        if (err instanceof DOMException && err.name === "AbortError") {
          logToServer(
            "[audio] play() AbortError silenced (transition expected)",
          );
          return;
        }
        const message = err instanceof Error ? err.message : "Playback failed";
        logToServer(`[audio] play() rejected: ${message}`);
        setState((prev) => ({
          ...prev,
          isPlaying: false,
          error: message,
        }));
      });
      setState((prev) => ({
        ...prev,
        currentTrack: track,
        isPlaying: true,
        progress: 0,
        duration: 0,
        error: null,
      }));
    },
    [logToServer],
  );

  const playQueue = useCallback(
    ({ tracks, context, startIndex }: PlaybackQueueRequest) => {
      setCurrentStationToken(getCurrentStationToken(context));
      void playRemote({
        payload: {
          tracks: [...tracks],
          context,
          ...(startIndex === undefined ? {} : { startIndex }),
        },
      }).then((exit) => {
        if (exit._tag === "Success") {
          handleServerState(exit.value, "play-response");
        } else {
          logToServer("[action] play mutation failed");
          setState((prev) => ({
            ...prev,
            error: "Playback failed",
          }));
        }
      });
    },
    [playRemote, setCurrentStationToken, handleServerState, logToServer],
  );

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  // Project the internal loose state into the public PlaybackState ADT.
  // Failed takes precedence (errors don't disappear silently); otherwise
  // the presence of a currentTrack distinguishes Stopped from Playing/Paused.
  const publicState: PlaybackState = state.error
    ? {
        _tag: "Failed",
        error: state.error,
        track: state.currentTrack,
        stationToken: state.currentStationToken,
      }
    : state.currentTrack == null
      ? { _tag: "Stopped" }
      : state.isPlaying
        ? {
            _tag: "Playing",
            track: state.currentTrack,
            stationToken: state.currentStationToken,
          }
        : {
            _tag: "Paused",
            track: state.currentTrack,
            stationToken: state.currentStationToken,
          };

  return {
    state: publicState,
    progress: state.progress,
    duration: state.duration,
    volume: state.volume,
    playTrack,
    playQueue,
    togglePlayPause,
    stop,
    seek,
    triggerSkip,
    triggerPrevious,
    clearError,
  };
}
