import { describe, it, expect } from "bun:test";
import {
	pyxisReducer,
	initialState,
	type PyxisState,
	type PyxisAction,
} from "./usePyxis.js";

describe("usePyxis reducer", () => {
	describe("initial state", () => {
		it("should have correct default values", () => {
			expect(initialState.currentView).toBe("stations");
			expect(initialState.activeOverlay).toBeNull();
			expect(initialState.isAuthenticated).toBe(false);
			expect(initialState.username).toBeNull();
			expect(initialState.stations).toEqual([]);
			expect(initialState.selectedStationIndex).toBe(0);
			expect(initialState.stationFilter).toBe("");
			expect(initialState.isLoadingStations).toBe(false);
			expect(initialState.themeName).toBe("pyxis");
			expect(initialState.notification).toBeNull();
		});
	});

	describe("SET_VIEW action", () => {
		it("should change current view to stations", () => {
			const state: PyxisState = { ...initialState, currentView: "search" };
			const action: PyxisAction = { type: "SET_VIEW", payload: "stations" };
			const result = pyxisReducer(state, action);
			expect(result.currentView).toBe("stations");
		});

		it("should change current view to search", () => {
			const action: PyxisAction = { type: "SET_VIEW", payload: "search" };
			const result = pyxisReducer(initialState, action);
			expect(result.currentView).toBe("search");
		});

		it("should change current view to nowPlaying", () => {
			const action: PyxisAction = { type: "SET_VIEW", payload: "nowPlaying" };
			const result = pyxisReducer(initialState, action);
			expect(result.currentView).toBe("nowPlaying");
		});

		it("should change current view to bookmarks", () => {
			const action: PyxisAction = { type: "SET_VIEW", payload: "bookmarks" };
			const result = pyxisReducer(initialState, action);
			expect(result.currentView).toBe("bookmarks");
		});

		it("should change current view to settings", () => {
			const action: PyxisAction = { type: "SET_VIEW", payload: "settings" };
			const result = pyxisReducer(initialState, action);
			expect(result.currentView).toBe("settings");
		});
	});

	describe("SET_OVERLAY action", () => {
		it("should open help overlay", () => {
			const action: PyxisAction = { type: "SET_OVERLAY", payload: "help" };
			const result = pyxisReducer(initialState, action);
			expect(result.activeOverlay).toBe("help");
		});

		it("should open commandPalette overlay", () => {
			const action: PyxisAction = {
				type: "SET_OVERLAY",
				payload: "commandPalette",
			};
			const result = pyxisReducer(initialState, action);
			expect(result.activeOverlay).toBe("commandPalette");
		});

		it("should open themePicker overlay", () => {
			const action: PyxisAction = {
				type: "SET_OVERLAY",
				payload: "themePicker",
			};
			const result = pyxisReducer(initialState, action);
			expect(result.activeOverlay).toBe("themePicker");
		});

		it("should open trackInfo overlay", () => {
			const action: PyxisAction = { type: "SET_OVERLAY", payload: "trackInfo" };
			const result = pyxisReducer(initialState, action);
			expect(result.activeOverlay).toBe("trackInfo");
		});

		it("should open renameStation overlay", () => {
			const action: PyxisAction = {
				type: "SET_OVERLAY",
				payload: "renameStation",
			};
			const result = pyxisReducer(initialState, action);
			expect(result.activeOverlay).toBe("renameStation");
		});

		it("should open confirm overlay", () => {
			const action: PyxisAction = { type: "SET_OVERLAY", payload: "confirm" };
			const result = pyxisReducer(initialState, action);
			expect(result.activeOverlay).toBe("confirm");
		});

		it("should open log overlay", () => {
			const action: PyxisAction = { type: "SET_OVERLAY", payload: "log" };
			const result = pyxisReducer(initialState, action);
			expect(result.activeOverlay).toBe("log");
		});
	});

	describe("CLOSE_OVERLAY action", () => {
		it("should close any open overlay", () => {
			const state: PyxisState = { ...initialState, activeOverlay: "help" };
			const action: PyxisAction = { type: "CLOSE_OVERLAY" };
			const result = pyxisReducer(state, action);
			expect(result.activeOverlay).toBeNull();
		});

		it("should be safe to call when no overlay is open", () => {
			const action: PyxisAction = { type: "CLOSE_OVERLAY" };
			const result = pyxisReducer(initialState, action);
			expect(result.activeOverlay).toBeNull();
		});
	});

	describe("SET_AUTHENTICATED action", () => {
		it("should set authenticated with username", () => {
			const action: PyxisAction = {
				type: "SET_AUTHENTICATED",
				payload: { isAuthenticated: true, username: "test@example.com" },
			};
			const result = pyxisReducer(initialState, action);
			expect(result.isAuthenticated).toBe(true);
			expect(result.username).toBe("test@example.com");
		});

		it("should set not authenticated", () => {
			const state: PyxisState = {
				...initialState,
				isAuthenticated: true,
				username: "test@example.com",
			};
			const action: PyxisAction = {
				type: "SET_AUTHENTICATED",
				payload: { isAuthenticated: false, username: null },
			};
			const result = pyxisReducer(state, action);
			expect(result.isAuthenticated).toBe(false);
			expect(result.username).toBeNull();
		});
	});

	describe("SET_STATIONS action", () => {
		it("should set stations and clear loading state", () => {
			const state: PyxisState = { ...initialState, isLoadingStations: true };
			const stations = [
				{ stationId: "1", stationName: "Station 1" },
				{ stationId: "2", stationName: "Station 2" },
			];
			const action: PyxisAction = { type: "SET_STATIONS", payload: stations };
			const result = pyxisReducer(state, action);
			expect(result.stations).toEqual(stations);
			expect(result.isLoadingStations).toBe(false);
		});

		it("should handle empty stations array", () => {
			const action: PyxisAction = { type: "SET_STATIONS", payload: [] };
			const result = pyxisReducer(initialState, action);
			expect(result.stations).toEqual([]);
		});
	});

	describe("SET_LOADING_STATIONS action", () => {
		it("should set loading to true", () => {
			const action: PyxisAction = {
				type: "SET_LOADING_STATIONS",
				payload: true,
			};
			const result = pyxisReducer(initialState, action);
			expect(result.isLoadingStations).toBe(true);
		});

		it("should set loading to false", () => {
			const state: PyxisState = { ...initialState, isLoadingStations: true };
			const action: PyxisAction = {
				type: "SET_LOADING_STATIONS",
				payload: false,
			};
			const result = pyxisReducer(state, action);
			expect(result.isLoadingStations).toBe(false);
		});
	});

	describe("SELECT_STATION action", () => {
		it("should select station by index", () => {
			const state: PyxisState = {
				...initialState,
				stations: [
					{ stationId: "1", stationName: "Station 1" },
					{ stationId: "2", stationName: "Station 2" },
					{ stationId: "3", stationName: "Station 3" },
				],
			};
			const action: PyxisAction = { type: "SELECT_STATION", payload: 2 };
			const result = pyxisReducer(state, action);
			expect(result.selectedStationIndex).toBe(2);
		});

		it("should allow selecting index 0", () => {
			const state: PyxisState = { ...initialState, selectedStationIndex: 5 };
			const action: PyxisAction = { type: "SELECT_STATION", payload: 0 };
			const result = pyxisReducer(state, action);
			expect(result.selectedStationIndex).toBe(0);
		});
	});

	describe("MOVE_SELECTION action", () => {
		const stateWithStations: PyxisState = {
			...initialState,
			stations: [
				{ stationId: "1", stationName: "Station 1" },
				{ stationId: "2", stationName: "Station 2" },
				{ stationId: "3", stationName: "Station 3" },
				{ stationId: "4", stationName: "Station 4" },
				{ stationId: "5", stationName: "Station 5" },
			],
			selectedStationIndex: 2,
		};

		describe("up direction", () => {
			it("should move selection up by one", () => {
				const action: PyxisAction = { type: "MOVE_SELECTION", payload: "up" };
				const result = pyxisReducer(stateWithStations, action);
				expect(result.selectedStationIndex).toBe(1);
			});

			it("should not go below 0", () => {
				const state = { ...stateWithStations, selectedStationIndex: 0 };
				const action: PyxisAction = { type: "MOVE_SELECTION", payload: "up" };
				const result = pyxisReducer(state, action);
				expect(result.selectedStationIndex).toBe(0);
			});
		});

		describe("down direction", () => {
			it("should move selection down by one", () => {
				const action: PyxisAction = { type: "MOVE_SELECTION", payload: "down" };
				const result = pyxisReducer(stateWithStations, action);
				expect(result.selectedStationIndex).toBe(3);
			});

			it("should not exceed max index", () => {
				const state = { ...stateWithStations, selectedStationIndex: 4 };
				const action: PyxisAction = { type: "MOVE_SELECTION", payload: "down" };
				const result = pyxisReducer(state, action);
				expect(result.selectedStationIndex).toBe(4);
			});
		});

		describe("top direction", () => {
			it("should jump to first station", () => {
				const action: PyxisAction = { type: "MOVE_SELECTION", payload: "top" };
				const result = pyxisReducer(stateWithStations, action);
				expect(result.selectedStationIndex).toBe(0);
			});
		});

		describe("bottom direction", () => {
			it("should jump to last station", () => {
				const action: PyxisAction = {
					type: "MOVE_SELECTION",
					payload: "bottom",
				};
				const result = pyxisReducer(stateWithStations, action);
				expect(result.selectedStationIndex).toBe(4);
			});
		});

		it("should handle empty stations list (returns -1 as max)", () => {
			// Note: With empty stations, max = -1, so down clamps to -1
			// This is a known edge case - in practice, empty stations shouldn't allow navigation
			const state: PyxisState = { ...initialState, stations: [] };
			const action: PyxisAction = { type: "MOVE_SELECTION", payload: "down" };
			const result = pyxisReducer(state, action);
			expect(result.selectedStationIndex).toBe(-1);
		});
	});

	describe("SET_STATION_FILTER action", () => {
		it("should set filter and reset selection to 0", () => {
			const state: PyxisState = { ...initialState, selectedStationIndex: 5 };
			const action: PyxisAction = {
				type: "SET_STATION_FILTER",
				payload: "rock",
			};
			const result = pyxisReducer(state, action);
			expect(result.stationFilter).toBe("rock");
			expect(result.selectedStationIndex).toBe(0);
		});

		it("should handle empty filter", () => {
			const state: PyxisState = { ...initialState, stationFilter: "rock" };
			const action: PyxisAction = { type: "SET_STATION_FILTER", payload: "" };
			const result = pyxisReducer(state, action);
			expect(result.stationFilter).toBe("");
		});
	});

	describe("SET_THEME action", () => {
		it("should change theme name", () => {
			const action: PyxisAction = { type: "SET_THEME", payload: "dracula" };
			const result = pyxisReducer(initialState, action);
			expect(result.themeName).toBe("dracula");
		});

		it("should accept any theme name", () => {
			const themes = [
				"catppuccin",
				"gruvbox",
				"nord",
				"rose-pine",
				"tokyonight",
			];
			for (const themeName of themes) {
				const action: PyxisAction = { type: "SET_THEME", payload: themeName };
				const result = pyxisReducer(initialState, action);
				expect(result.themeName).toBe(themeName);
			}
		});
	});

	describe("SHOW_NOTIFICATION action", () => {
		it("should show success notification", () => {
			const action: PyxisAction = {
				type: "SHOW_NOTIFICATION",
				payload: { message: "Station created!", variant: "success" },
			};
			const result = pyxisReducer(initialState, action);
			expect(result.notification).toEqual({
				message: "Station created!",
				variant: "success",
			});
		});

		it("should show error notification", () => {
			const action: PyxisAction = {
				type: "SHOW_NOTIFICATION",
				payload: { message: "Failed to load", variant: "error" },
			};
			const result = pyxisReducer(initialState, action);
			expect(result.notification).toEqual({
				message: "Failed to load",
				variant: "error",
			});
		});

		it("should show info notification", () => {
			const action: PyxisAction = {
				type: "SHOW_NOTIFICATION",
				payload: { message: "Loading...", variant: "info" },
			};
			const result = pyxisReducer(initialState, action);
			expect(result.notification).toEqual({
				message: "Loading...",
				variant: "info",
			});
		});

		it("should replace existing notification", () => {
			const state: PyxisState = {
				...initialState,
				notification: { message: "Old message", variant: "info" },
			};
			const action: PyxisAction = {
				type: "SHOW_NOTIFICATION",
				payload: { message: "New message", variant: "success" },
			};
			const result = pyxisReducer(state, action);
			expect(result.notification).toEqual({
				message: "New message",
				variant: "success",
			});
		});
	});

	describe("CLEAR_NOTIFICATION action", () => {
		it("should clear notification", () => {
			const state: PyxisState = {
				...initialState,
				notification: { message: "Test", variant: "info" },
			};
			const action: PyxisAction = { type: "CLEAR_NOTIFICATION" };
			const result = pyxisReducer(state, action);
			expect(result.notification).toBeNull();
		});

		it("should be safe to call when no notification exists", () => {
			const action: PyxisAction = { type: "CLEAR_NOTIFICATION" };
			const result = pyxisReducer(initialState, action);
			expect(result.notification).toBeNull();
		});
	});

	describe("unknown action type", () => {
		it("should return state unchanged for unknown action", () => {
			const action = { type: "UNKNOWN_ACTION", payload: "test" } as never;
			const result = pyxisReducer(initialState, action);
			expect(result).toEqual(initialState);
		});
	});

	describe("state immutability", () => {
		it("should not mutate original state", () => {
			const state: PyxisState = {
				...initialState,
				stations: [{ stationId: "1", stationName: "Station 1" }],
			};
			const originalState = JSON.parse(JSON.stringify(state));
			const action: PyxisAction = {
				type: "SET_STATIONS",
				payload: [{ stationId: "2", stationName: "Station 2" }],
			};
			pyxisReducer(state, action);
			expect(state).toEqual(originalState);
		});
	});
});
