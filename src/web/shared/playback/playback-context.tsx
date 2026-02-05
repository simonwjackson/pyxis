/**
 * @module PlaybackContext
 * React context for global playback state management.
 * Provides playback controls to all components in the app.
 */

import { createContext, useContext, type ReactNode } from "react";
import { usePlayback } from "./use-playback";

/**
 * Type of the playback context value, derived from usePlayback hook return type.
 */
type PlaybackContextValue = ReturnType<typeof usePlayback>;

const PlaybackContext = createContext<PlaybackContextValue | null>(null);

/**
 * Provides playback state and controls to the component tree.
 * Must wrap components that use the usePlaybackContext hook.
 *
 * @param children - Child components that can access playback context
 */
export function PlaybackProvider({ children }: { children: ReactNode }) {
	const playback = usePlayback();

	return (
		<PlaybackContext.Provider value={playback}>
			{children}
		</PlaybackContext.Provider>
	);
}

/**
 * Accesses the playback context for controlling audio playback.
 * Must be used within a PlaybackProvider.
 *
 * @returns Playback state and control functions
 * @throws Error if used outside of PlaybackProvider
 *
 * @example
 * ```tsx
 * const { isPlaying, togglePlayPause, currentTrack } = usePlaybackContext();
 * ```
 */
export function usePlaybackContext() {
	const context = useContext(PlaybackContext);
	if (!context) {
		throw new Error(
			"usePlaybackContext must be used within a PlaybackProvider",
		);
	}
	return context;
}
