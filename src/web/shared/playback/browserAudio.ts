export type PlaybackAudioEvent =
  | "timeupdate"
  | "durationchange"
  | "ended"
  | "error"
  | "canplay";

export type PlaybackMediaError = {
  readonly code: number;
  readonly message?: string;
};

export type PlaybackAudioSnapshot = {
  readonly src: string;
  readonly paused: boolean;
  readonly currentTime: number;
  readonly readyState: number;
};

export type BrowserAudio = {
  readonly snapshot: () => PlaybackAudioSnapshot;
  readonly getDuration: () => number;
  readonly getError: () => PlaybackMediaError | null;
  readonly setSrc: (src: string) => void;
  readonly setCurrentTime: (time: number) => void;
  readonly setVolume: (volume: number) => void;
  readonly play: () => Promise<void>;
  readonly pause: () => void;
  readonly addEventListener: (
    event: PlaybackAudioEvent,
    listener: () => void,
  ) => void;
  readonly removeEventListener: (
    event: PlaybackAudioEvent,
    listener: () => void,
  ) => void;
};

const HAVE_METADATA = 1;
const MEDIA_ERR_ABORTED = 1;
const MEDIA_ERR_NETWORK = 2;
const MEDIA_ERR_DECODE = 3;
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;

export const BrowserAudio = {
  haveMetadata: HAVE_METADATA,
  mediaErrorAborted: MEDIA_ERR_ABORTED,

  create: (): BrowserAudio => {
    const audio = new Audio();

    return {
      snapshot: () => ({
        src: audio.src,
        paused: audio.paused,
        currentTime: audio.currentTime,
        readyState: audio.readyState,
      }),
      getDuration: () => audio.duration,
      getError: () => audio.error,
      setSrc: (src) => {
        audio.src = src;
      },
      setCurrentTime: (time) => {
        audio.currentTime = time;
      },
      setVolume: (volume) => {
        audio.volume = volume;
      },
      play: () => audio.play(),
      pause: () => audio.pause(),
      addEventListener: (event, listener) =>
        audio.addEventListener(event, listener),
      removeEventListener: (event, listener) =>
        audio.removeEventListener(event, listener),
    };
  },

  describeError: (error: PlaybackMediaError | null): string => {
    if (!error) return "Audio playback failed";

    const codeMessages: Record<number, string> = {
      [MEDIA_ERR_ABORTED]: "Playback aborted",
      [MEDIA_ERR_NETWORK]: "Network error loading audio",
      [MEDIA_ERR_DECODE]: "Audio decoding error",
      [MEDIA_ERR_SRC_NOT_SUPPORTED]: "Audio format not supported",
    };
    const base = codeMessages[error.code] ?? "Audio playback failed";
    return error.message ? `${base}: ${error.message}` : base;
  },
};
