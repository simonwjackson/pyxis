import { createContext, useContext, type ReactNode } from "react";
import { usePlayback } from "./use-playback";

type PlaybackContextValue = ReturnType<typeof usePlayback>;

const PlaybackContext = createContext<PlaybackContextValue | null>(null);

export function PlaybackProvider({ children }: { children: ReactNode }) {
	const playback = usePlayback();

	return (
		<PlaybackContext.Provider value={playback}>
			{children}
		</PlaybackContext.Provider>
	);
}

export function usePlaybackContext() {
	const context = useContext(PlaybackContext);
	if (!context) {
		throw new Error(
			"usePlaybackContext must be used within a PlaybackProvider",
		);
	}
	return context;
}
