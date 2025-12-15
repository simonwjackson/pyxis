import { useReducer, useCallback } from "react";

// View types
type View = "stations" | "nowPlaying" | "search" | "settings";
type Overlay =
	| "commandPalette"
	| "themePicker"
	| "confirm"
	| "help"
	| "log"
	| null;

// Station type (matches API response)
interface Station {
	readonly stationId: string;
	readonly stationName: string;
	readonly isQuickMix?: boolean;
	readonly artUrl?: string;
}

// Track type
interface Track {
	readonly trackToken: string;
	readonly songName: string;
	readonly artistName: string;
	readonly albumName: string;
	readonly albumArtUrl?: string;
	readonly trackLength?: number;
	readonly rating?: number; // 0=none, 1=liked
}

// Application state
interface PyxisState {
	// Navigation
	readonly currentView: View;
	readonly activeOverlay: Overlay;

	// Auth
	readonly isAuthenticated: boolean;
	readonly username: string | null;

	// Stations
	readonly stations: readonly Station[];
	readonly selectedStationIndex: number;
	readonly stationFilter: string;
	readonly isLoadingStations: boolean;

	// Playback
	readonly currentStation: Station | null;
	readonly currentTrack: Track | null;
	readonly isPlaying: boolean;
	readonly playbackPosition: number;
	readonly queue: readonly Track[];

	// UI
	readonly themeName: string;

	// Feedback
	readonly notification: {
		message: string;
		variant: "success" | "error" | "info";
	} | null;
}

// Action types
type PyxisAction =
	| { type: "SET_VIEW"; payload: View }
	| { type: "SET_OVERLAY"; payload: Overlay }
	| { type: "CLOSE_OVERLAY" }
	| {
			type: "SET_AUTHENTICATED";
			payload: { isAuthenticated: boolean; username: string | null };
	  }
	| { type: "SET_STATIONS"; payload: readonly Station[] }
	| { type: "SET_LOADING_STATIONS"; payload: boolean }
	| { type: "SELECT_STATION"; payload: number }
	| { type: "MOVE_SELECTION"; payload: "up" | "down" | "top" | "bottom" }
	| { type: "SET_STATION_FILTER"; payload: string }
	| { type: "PLAY_STATION"; payload: Station }
	| { type: "SET_CURRENT_TRACK"; payload: Track | null }
	| { type: "SET_PLAYING"; payload: boolean }
	| { type: "SET_PLAYBACK_POSITION"; payload: number }
	| { type: "SET_QUEUE"; payload: readonly Track[] }
	| { type: "LIKE_TRACK" }
	| { type: "DISLIKE_TRACK" }
	| { type: "SET_THEME"; payload: string }
	| {
			type: "SHOW_NOTIFICATION";
			payload: { message: string; variant: "success" | "error" | "info" };
	  }
	| { type: "CLEAR_NOTIFICATION" };

// Initial state
const initialState: PyxisState = {
	currentView: "stations",
	activeOverlay: null,
	isAuthenticated: false,
	username: null,
	stations: [],
	selectedStationIndex: 0,
	stationFilter: "",
	isLoadingStations: false,
	currentStation: null,
	currentTrack: null,
	isPlaying: false,
	playbackPosition: 0,
	queue: [],
	themeName: "pyxis",
	notification: null,
};

// Reducer function
const pyxisReducer = (state: PyxisState, action: PyxisAction): PyxisState => {
	switch (action.type) {
		case "SET_VIEW":
			return { ...state, currentView: action.payload };
		case "SET_OVERLAY":
			return { ...state, activeOverlay: action.payload };
		case "CLOSE_OVERLAY":
			return { ...state, activeOverlay: null };
		case "SET_AUTHENTICATED":
			return { ...state, ...action.payload };
		case "SET_STATIONS":
			return { ...state, stations: action.payload, isLoadingStations: false };
		case "SET_LOADING_STATIONS":
			return { ...state, isLoadingStations: action.payload };
		case "SELECT_STATION":
			return { ...state, selectedStationIndex: action.payload };
		case "MOVE_SELECTION": {
			const { stations, selectedStationIndex } = state;
			const max = stations.length - 1;
			let newIndex = selectedStationIndex;
			switch (action.payload) {
				case "up":
					newIndex = Math.max(0, selectedStationIndex - 1);
					break;
				case "down":
					newIndex = Math.min(max, selectedStationIndex + 1);
					break;
				case "top":
					newIndex = 0;
					break;
				case "bottom":
					newIndex = max;
					break;
			}
			return { ...state, selectedStationIndex: newIndex };
		}
		case "SET_STATION_FILTER":
			return {
				...state,
				stationFilter: action.payload,
				selectedStationIndex: 0,
			};
		case "PLAY_STATION":
			return { ...state, currentStation: action.payload, isPlaying: true };
		case "SET_CURRENT_TRACK":
			return { ...state, currentTrack: action.payload, playbackPosition: 0 };
		case "SET_PLAYING":
			return { ...state, isPlaying: action.payload };
		case "SET_PLAYBACK_POSITION":
			return { ...state, playbackPosition: action.payload };
		case "SET_QUEUE":
			return { ...state, queue: action.payload };
		case "LIKE_TRACK":
			if (!state.currentTrack) return state;
			return { ...state, currentTrack: { ...state.currentTrack, rating: 1 } };
		case "DISLIKE_TRACK":
			// Dislike typically skips the track
			return { ...state, currentTrack: null };
		case "SET_THEME":
			return { ...state, themeName: action.payload };
		case "SHOW_NOTIFICATION":
			return { ...state, notification: action.payload };
		case "CLEAR_NOTIFICATION":
			return { ...state, notification: null };
		default:
			return state;
	}
};

// Custom hook
export const usePyxis = (initialTheme?: string) => {
	const [state, dispatch] = useReducer(
		pyxisReducer,
		initialTheme ? { ...initialState, themeName: initialTheme } : initialState,
	);

	// Action creators
	const actions = {
		setView: useCallback(
			(view: View) => dispatch({ type: "SET_VIEW", payload: view }),
			[],
		),
		openOverlay: useCallback(
			(overlay: Overlay) => dispatch({ type: "SET_OVERLAY", payload: overlay }),
			[],
		),
		closeOverlay: useCallback(() => dispatch({ type: "CLOSE_OVERLAY" }), []),
		setAuthenticated: useCallback(
			(isAuthenticated: boolean, username: string | null) =>
				dispatch({
					type: "SET_AUTHENTICATED",
					payload: { isAuthenticated, username },
				}),
			[],
		),
		setStations: useCallback(
			(stations: readonly Station[]) =>
				dispatch({ type: "SET_STATIONS", payload: stations }),
			[],
		),
		setLoadingStations: useCallback(
			(loading: boolean) =>
				dispatch({ type: "SET_LOADING_STATIONS", payload: loading }),
			[],
		),
		selectStation: useCallback(
			(index: number) => dispatch({ type: "SELECT_STATION", payload: index }),
			[],
		),
		moveSelection: useCallback(
			(direction: "up" | "down" | "top" | "bottom") =>
				dispatch({ type: "MOVE_SELECTION", payload: direction }),
			[],
		),
		setStationFilter: useCallback(
			(filter: string) =>
				dispatch({ type: "SET_STATION_FILTER", payload: filter }),
			[],
		),
		playStation: useCallback(
			(station: Station) =>
				dispatch({ type: "PLAY_STATION", payload: station }),
			[],
		),
		setCurrentTrack: useCallback(
			(track: Track | null) =>
				dispatch({ type: "SET_CURRENT_TRACK", payload: track }),
			[],
		),
		setPlaying: useCallback(
			(playing: boolean) => dispatch({ type: "SET_PLAYING", payload: playing }),
			[],
		),
		setPlaybackPosition: useCallback(
			(position: number) =>
				dispatch({ type: "SET_PLAYBACK_POSITION", payload: position }),
			[],
		),
		setQueue: useCallback(
			(queue: readonly Track[]) =>
				dispatch({ type: "SET_QUEUE", payload: queue }),
			[],
		),
		likeTrack: useCallback(() => dispatch({ type: "LIKE_TRACK" }), []),
		dislikeTrack: useCallback(() => dispatch({ type: "DISLIKE_TRACK" }), []),
		setTheme: useCallback(
			(theme: string) => dispatch({ type: "SET_THEME", payload: theme }),
			[],
		),
		showNotification: useCallback(
			(message: string, variant: "success" | "error" | "info") =>
				dispatch({ type: "SHOW_NOTIFICATION", payload: { message, variant } }),
			[],
		),
		clearNotification: useCallback(
			() => dispatch({ type: "CLEAR_NOTIFICATION" }),
			[],
		),
	};

	return { state, actions };
};

// Export types
export type { PyxisState, PyxisAction, Station, Track, View, Overlay };
