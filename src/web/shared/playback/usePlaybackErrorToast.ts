import { useEffect } from "react";
import { toast } from "sonner";
import type { PlaybackContextValue } from "./types";
import { PlaybackState } from "./types";

export function usePlaybackErrorToast(playback: PlaybackContextValue): void {
  const playbackError = PlaybackState.error(playback.state);

  useEffect(() => {
    if (playbackError) {
      toast.error(`Audio error: ${playbackError}`);
      playback.clearError();
    }
  }, [playbackError, playback]);
}
