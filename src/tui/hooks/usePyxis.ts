import { useCallback, useReducer } from "react";

// View types
type View = "stations" | "nowPlaying" | "search" | "settings" | "bookmarks";
type Overlay =
	| "commandPalette"
	| "themePicker"
	| "confirm"
	| "help"
	| "log"
	| "trackInfo"
	| "renameStation"
	| null;

// Station type (matches API response)
type Station = {
	readonly stationId: string;
	readonly stationName: string;
	readonly isQuickMix?: boolean;
	readonly artUrl?: string;
};

// Track type (kept for reference, but playback state now in useQueue)
type Track = {
	readonly trackToken: string;
	readonly songName: string;
	readonly artistName: string;
	readonly albumName: string;
	readonly albumArtUrl?: string;
	readonly trackLength?: number;
	readonly rating?: number; // 0=none, 1=liked
};

// Application state - UI-focused, playback is in useQueue
type PyxisState = {
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
	readonly isFilterActive: boolean;
	readonly isLoadingStations: boolean;

	// UI
	readonly themeName: string;

	// Feedback
	readonly notification: {
		message: string;
		variant: "success" | "error" | "info";
	} | null;
};

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
	| {
			type: "MOVE_SELECTION";
			payload: {
				direction: "up" | "down" | "top" | "bottom";
				maxIndex: number;
			};
	  }
	| { type: "SET_STATION_FILTER"; payload: string }
	| { type: "SET_FILTER_ACTIVE"; payload: boolean }
	| { type: "CLEAR_FILTER" }
	| { type: "SET_THEME"; payload: string }
	| {
			type: "SHOW_NOTIFICATION";
			payload: { message: string; variant: "success" | "error" | "info" };
	  }
	| { type: "CLEAR_NOTIFICATION" };

// Initial state - exported for testing
export const initialState: PyxisState = {
	currentView: "stations",
	activeOverlay: null,
	isAuthenticated: false,
	username: null,
	stations: [],
	selectedStationIndex: 0,
	stationFilter: "",
	isFilterActive: false,
	isLoadingStations: false,
	themeName: "pyxis",
	notification: null,
};

// Reducer function - exported for testing
export const pyxisReducer = (
	state: PyxisState,
	action: PyxisAction,
): PyxisState => {
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
			const { selectedStationIndex } = state;
			const { direction, maxIndex } = action.payload;
			const max = maxIndex;
			let newIndex = selectedStationIndex;
			switch (direction) {
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
		case "SET_FILTER_ACTIVE":
			return { ...state, isFilterActive: action.payload };
		case "CLEAR_FILTER":
			return {
				...state,
				stationFilter: "",
				isFilterActive: false,
				selectedStationIndex: 0,
			};
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
		goBack: useCallback(
			() => dispatch({ type: "SET_VIEW", payload: "stations" }),
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
			(direction: "up" | "down" | "top" | "bottom", maxIndex: number) =>
				dispatch({ type: "MOVE_SELECTION", payload: { direction, maxIndex } }),
			[],
		),
		setStationFilter: useCallback(
			(filter: string) =>
				dispatch({ type: "SET_STATION_FILTER", payload: filter }),
			[],
		),
		setFilterActive: useCallback(
			(active: boolean) =>
				dispatch({ type: "SET_FILTER_ACTIVE", payload: active }),
			[],
		),
		clearFilter: useCallback(() => dispatch({ type: "CLEAR_FILTER" }), []),
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
