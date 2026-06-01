import type { ApiPlayerState } from "../../../api/contracts/player.js";
import type { PlaybackAudioSnapshot } from "./browserAudio";
import type { PlaybackTrack } from "./types";

export type PlaybackServerStateSource =
  | "sse"
  | "trackEnded-response"
  | "skip-response"
  | "prev-response"
  | "play-response";

export type PlaybackAudioAction =
  | { readonly _tag: "Load"; readonly src: string }
  | {
      readonly _tag: "Seek";
      readonly position: number;
      readonly when: "now" | "canplay";
    }
  | { readonly _tag: "Play"; readonly context: string }
  | { readonly _tag: "Pause" }
  | { readonly _tag: "ResetTime" }
  | { readonly _tag: "SetVolume"; readonly volume: number };

export type PlaybackStatePatch = {
  readonly currentTrack: PlaybackTrack | null;
  readonly isPlaying: boolean;
  readonly progress: number | null;
  readonly duration?: number;
  readonly volume?: number;
};

export type PlaybackReconciliationInput = {
  readonly serverState: ApiPlayerState;
  readonly source: PlaybackServerStateSource;
  readonly audio: PlaybackAudioSnapshot;
  readonly lastStreamUrl: string | null;
  readonly hasReceivedInitialState: boolean;
  readonly haveMetadata: number;
};

export type PlaybackReconciliation = {
  readonly actions: readonly PlaybackAudioAction[];
  readonly logs: readonly string[];
  readonly statePatch: PlaybackStatePatch;
  readonly nextLastStreamUrl: string | null;
  readonly nextHasReceivedInitialState: boolean;
  readonly serverProgress: number;
};

type LoadedServerState = ApiPlayerState & {
  readonly currentTrack: NonNullable<ApiPlayerState["currentTrack"]>;
};

type PolicyBranch = {
  readonly actions: readonly PlaybackAudioAction[];
  readonly logs: readonly string[];
};

type LoadedPolicyContext = {
  readonly serverState: LoadedServerState;
  readonly source: PlaybackServerStateSource;
  readonly audio: PlaybackAudioSnapshot;
  readonly haveMetadata: number;
  readonly isInitialState: boolean;
  readonly streamChanged: boolean;
};

const baseStreamUrl = (url: string): string => url.split("?")[0] ?? url;

const toPlaybackTrack = (
  track: NonNullable<ApiPlayerState["currentTrack"]>,
): PlaybackTrack => ({
  trackToken: track.id,
  songName: track.title,
  artistName: track.artist,
  albumName: track.album,
  audioUrl: track.streamUrl,
  ...(track.artworkUrl ? { artUrl: track.artworkUrl } : {}),
});

const seekAction = (
  audio: PlaybackAudioSnapshot,
  position: number,
  haveMetadata: number,
): PlaybackAudioAction | null => {
  if (position <= 0) return null;
  return {
    _tag: "Seek",
    position,
    when: audio.readyState >= haveMetadata ? "now" : "canplay",
  };
};

const noTrackBranch = (
  source: PlaybackServerStateSource,
  audio: PlaybackAudioSnapshot,
): PolicyBranch => ({
  actions: audio.paused ? [] : [{ _tag: "Pause" }],
  logs: [`[${source}] → NO track: stopped`],
});

const seekIfProgressDrifted = ({
  source,
  audio,
  progress,
  haveMetadata,
  prefix,
}: {
  readonly source: PlaybackServerStateSource;
  readonly audio: PlaybackAudioSnapshot;
  readonly progress: number;
  readonly haveMetadata: number;
  readonly prefix: string;
}): PolicyBranch => {
  const delta = Math.abs(audio.currentTime - progress);
  if (delta <= 2) return { actions: [], logs: [] };

  const seek = seekAction(audio, progress, haveMetadata);
  return {
    actions: seek ? [seek] : [],
    logs: [
      `[${source}] → ${prefix}: seek ${String(audio.currentTime)}→${String(progress)} (delta=${String(delta)})`,
    ],
  };
};

const newStreamBranch = ({
  serverState,
  source,
  audio,
  haveMetadata,
  isInitialState,
}: LoadedPolicyContext): PolicyBranch => {
  const actions: PlaybackAudioAction[] = [
    { _tag: "Load", src: serverState.currentTrack.streamUrl },
  ];
  const seek = seekAction(audio, serverState.progress, haveMetadata);
  if (seek) actions.push(seek);

  if (isInitialState) {
    return {
      actions,
      logs: [
        `[${source}] → FIRST SSE state: load track, show paused at ${String(serverState.progress)}s`,
      ],
    };
  }

  if (serverState.status !== "playing") {
    return {
      actions,
      logs: [
        `[${source}] → LOAD new src (status=${serverState.status}, not playing)`,
      ],
    };
  }

  return {
    actions: [...actions, { _tag: "Play", context: "new track load" }],
    logs: [`[${source}] → LOAD new src + play() (status=playing)`],
  };
};

const initialSameStreamBranch = ({
  serverState,
  source,
  audio,
  haveMetadata,
}: LoadedPolicyContext): PolicyBranch => {
  switch (serverState.status) {
    case "playing":
      return initialSameStreamPlayingBranch({
        serverState,
        source,
        audio,
        haveMetadata,
      });
    case "paused":
      return initialSameStreamPausedBranch({
        serverState,
        source,
        audio,
        haveMetadata,
      });
    case "stopped":
      return {
        actions: [{ _tag: "Pause" }, { _tag: "ResetTime" }],
        logs: [`[${source}] → FIRST SSE state: same track, stop`],
      };
  }
};

const initialSameStreamPlayingBranch = ({
  serverState,
  source,
  audio,
  haveMetadata,
}: Pick<
  LoadedPolicyContext,
  "serverState" | "source" | "audio" | "haveMetadata"
>): PolicyBranch => {
  if (!audio.paused) {
    return {
      actions: [],
      logs: [
        `[${source}] → FIRST SSE state: same track already playing, keep playing`,
      ],
    };
  }

  const seek = seekIfProgressDrifted({
    source,
    audio,
    progress: serverState.progress,
    haveMetadata,
    prefix: "FIRST SSE state: same track paused locally",
  });

  return {
    actions: [
      ...seek.actions,
      { _tag: "Play", context: "initial same track resume" },
    ],
    logs: [
      ...seek.logs,
      `[${source}] → FIRST SSE state: same track, resume because server=playing`,
    ],
  };
};

const initialSameStreamPausedBranch = ({
  serverState,
  source,
  audio,
  haveMetadata,
}: Pick<
  LoadedPolicyContext,
  "serverState" | "source" | "audio" | "haveMetadata"
>): PolicyBranch => {
  const seek = seekAction(audio, serverState.progress, haveMetadata);
  const pause: PlaybackAudioAction[] = audio.paused ? [] : [{ _tag: "Pause" }];
  return {
    actions: [...(seek ? [seek] : []), ...pause],
    logs: [
      `[${source}] → FIRST SSE state: same track, seek to ${String(serverState.progress)}s, show paused`,
    ],
  };
};

const sameStreamBranch = ({
  serverState,
  source,
  audio,
  haveMetadata,
}: LoadedPolicyContext): PolicyBranch => {
  if (serverState.status === "playing" && audio.paused) {
    const seek = seekIfProgressDrifted({
      source,
      audio,
      progress: serverState.progress,
      haveMetadata,
      prefix: "SAME track",
    });
    return {
      actions: [
        ...seek.actions,
        { _tag: "Play", context: "same track resume" },
      ],
      logs: [...seek.logs, `[${source}] → SAME track: resume (paused→playing)`],
    };
  }

  if (serverState.status === "paused" && !audio.paused) {
    return {
      actions: [{ _tag: "Pause" }],
      logs: [`[${source}] → SAME track: pause (playing→paused)`],
    };
  }

  if (serverState.status === "stopped") {
    return {
      actions: [{ _tag: "Pause" }, { _tag: "ResetTime" }],
      logs: [`[${source}] → SAME track: stop`],
    };
  }

  return {
    actions: [],
    logs: [
      `[${source}] → SAME track: no action needed (server=${serverState.status} paused=${String(audio.paused)})`,
    ],
  };
};

const loadedBranch = (context: LoadedPolicyContext): PolicyBranch => {
  if (context.streamChanged) return newStreamBranch(context);
  if (context.isInitialState) return initialSameStreamBranch(context);
  return sameStreamBranch(context);
};

/**
 * Pure policy that reconciles authoritative server player state with local
 * browser-audio state. It decides what the hook should do; the hook owns
 * executing DOM/audio operations and reporting command outcomes.
 */
export const reconcilePlaybackState = ({
  serverState,
  source,
  audio,
  lastStreamUrl,
  hasReceivedInitialState,
  haveMetadata,
}: PlaybackReconciliationInput): PlaybackReconciliation => {
  const track = serverState.currentTrack;
  const isInitialState = source === "sse" && !hasReceivedInitialState;
  const nextHasReceivedInitialState =
    hasReceivedInitialState || source === "sse";

  if (!track) {
    return {
      ...noTrackBranch(source, audio),
      statePatch: {
        currentTrack: null,
        isPlaying: false,
        progress: 0,
        duration: 0,
      },
      nextLastStreamUrl: null,
      nextHasReceivedInitialState,
      serverProgress: serverState.progress,
    };
  }

  const lastBaseUrl =
    lastStreamUrl == null ? null : baseStreamUrl(lastStreamUrl);
  const streamChanged = baseStreamUrl(track.streamUrl) !== lastBaseUrl;
  const branch = loadedBranch({
    serverState: { ...serverState, currentTrack: track },
    source,
    audio,
    haveMetadata,
    isInitialState,
    streamChanged,
  });

  return {
    actions: [
      ...branch.actions,
      { _tag: "SetVolume", volume: serverState.volume / 100 },
    ],
    logs: [
      `[${source}] baseUrl comparison: base=${baseStreamUrl(track.streamUrl)} last=${lastBaseUrl} changed=${String(streamChanged)}`,
      ...branch.logs,
    ],
    statePatch: {
      currentTrack: toPlaybackTrack(track),
      isPlaying:
        isInitialState && streamChanged
          ? false
          : serverState.status === "playing",
      progress: isInitialState ? serverState.progress : null,
      volume: serverState.volume,
    },
    nextLastStreamUrl: streamChanged ? track.streamUrl : lastStreamUrl,
    nextHasReceivedInitialState,
    serverProgress: serverState.progress,
  };
};
