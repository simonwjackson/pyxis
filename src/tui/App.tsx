import { Spinner } from "@inkjs/ui";
import { Effect } from "effect";
import { Box, Text, useApp } from "ink";
import { type FC, useEffect, useMemo, useRef, useState } from "react";

import { Footer, Header } from "./components/layout/index.js";
import {
	CommandPalette,
	ConfirmDialog,
	HelpOverlay,
	LogViewer,
	ThemePicker,
	type Command,
} from "./components/overlays/index.js";
import { NowPlayingBar, NowPlayingView } from "./components/playback/index.js";
import { SearchView } from "./components/search/index.js";
import { StationList } from "./components/stations/index.js";
import {
	useKeybinds,
	usePyxis,
	useQueue,
	useTerminalSize,
	type View,
} from "./hooks/index.js";
import { ThemeProvider, loadTheme } from "./theme/index.js";
import { log } from "./utils/logger.js";
import { getSession } from "../cli/cache/session.js";
import { deleteStation, getStationList } from "../client.js";

type AppProps = {
	readonly initialTheme?: string;
};

// Hints for footer based on current view
const hintsByView: Record<
	View,
	readonly { readonly key: string; readonly action: string }[]
> = {
	stations: [
		{ key: "/", action: "search" },
		{ key: "n", action: "now playing" },
		{ key: "j/k", action: "navigate" },
		{ key: "⏎", action: "play" },
		{ key: "?", action: "help" },
		{ key: "q", action: "quit" },
	],
	search: [
		{ key: "Esc", action: "back" },
		{ key: "Tab", action: "switch focus" },
		{ key: "j/k", action: "navigate" },
		{ key: "⏎", action: "create station" },
	],
	nowPlaying: [
		{ key: "Esc", action: "back" },
		{ key: "/", action: "search" },
		{ key: "+/-", action: "rate" },
		{ key: "space", action: "pause" },
		{ key: "z", action: "sleep" },
	],
	settings: [
		{ key: "Esc", action: "back" },
		{ key: "j/k", action: "navigate" },
		{ key: "⏎", action: "select" },
	],
};

// Command palette commands - simplified since we removed unused params
const commands: readonly Command[] = [
	{
		id: "play",
		name: "Play station",
		description: "Start playing selected station",
		shortcut: "⏎",
	},
	{
		id: "search",
		name: "Search",
		description: "Search Pandora",
		shortcut: "/",
	},
	{
		id: "like",
		name: "Like track",
		description: "Thumbs up current track",
		shortcut: "+",
	},
	{
		id: "dislike",
		name: "Dislike track",
		description: "Thumbs down current track",
		shortcut: "-",
	},
	{
		id: "theme",
		name: "Theme",
		description: "Change color theme",
		shortcut: "^x t",
		category: "settings",
	},
	{
		id: "refresh",
		name: "Refresh",
		description: "Reload stations",
		shortcut: "^x r",
		category: "settings",
	},
	{
		id: "help",
		name: "Help",
		description: "Show keyboard shortcuts",
		shortcut: "?",
		category: "settings",
	},
	{
		id: "quit",
		name: "Quit",
		description: "Exit pyxis",
		shortcut: "q",
		category: "settings",
	},
];

export const App: FC<AppProps> = ({ initialTheme = "pyxis" }) => {
	const theme = loadTheme(initialTheme);
	const { columns, rows } = useTerminalSize();
	const { state, actions } = usePyxis(initialTheme);
	const { exit } = useApp();
	const loadedRef = useRef(false);
	const [pendingDeleteStation, setPendingDeleteStation] = useState<{
		stationId: string;
		stationName: string;
	} | null>(null);
	const [authSession, setAuthSession] = useState<{
		syncTime: number;
		partnerId: string;
		partnerAuthToken: string;
		userAuthToken: string;
		userId: string;
	} | null>(null);

	// Queue management - handles playback, advancement, and refill
	const queue = useQueue();

	// Show notification when queue has errors
	useEffect(() => {
		if (queue.state.error) {
			actions.showNotification(queue.state.error, "error");
		}
	}, [queue.state.error, actions]);

	// Show notification when track changes
	const lastNotifiedTrackRef = useRef<string | null>(null);
	useEffect(() => {
		const track = queue.state.currentTrack;
		if (track && track.trackToken !== lastNotifiedTrackRef.current) {
			lastNotifiedTrackRef.current = track.trackToken;
			actions.showNotification(`Playing: ${track.songName}`, "success");
		}
	}, [queue.state.currentTrack, actions]);

	// Load session and stations on mount
	useEffect(() => {
		// Prevent double-loading in strict mode
		if (loadedRef.current) return;
		loadedRef.current = true;

		const loadData = async () => {
			actions.setLoadingStations(true);

			try {
				// Try to load session from cache
				const session = await getSession();

				if (!session) {
					// No session - show login prompt
					actions.setAuthenticated(false, null);
					actions.setLoadingStations(false);
					return;
				}

				// Session found - mark as authenticated and store for search
				setAuthSession(session);
				actions.setAuthenticated(true, null);

				// Load stations using Effect
				const stationsResult = await Effect.runPromise(
					getStationList(session).pipe(Effect.either),
				);

				if (stationsResult._tag === "Right") {
					// Map API stations to component format
					const stations = stationsResult.right.stations.map((s) => ({
						stationId: s.stationId,
						stationName: s.stationName,
						isQuickMix: s.stationName.toLowerCase().includes("shuffle"),
					}));
					actions.setStations(stations);
				} else {
					// API error
					actions.showNotification(
						"Failed to load stations. Try logging in again.",
						"error",
					);
					actions.setLoadingStations(false);
				}
			} catch {
				// Unexpected error
				actions.showNotification("An unexpected error occurred.", "error");
				actions.setLoadingStations(false);
			}
		};

		loadData();
	}, [actions]);

	// Handle command palette selection
	const handleCommandSelect = (command: Command) => {
		actions.closeOverlay();
		switch (command.id) {
			case "play": {
				const selectedStation = state.stations[state.selectedStationIndex];
				if (selectedStation) {
					handlePlayStation(selectedStation);
				}
				break;
			}
			case "search":
				actions.setView("search");
				break;
			case "like":
				if (queue.state.currentTrack) {
					queue.likeTrack();
					actions.showNotification("Track liked!", "success");
				}
				break;
			case "dislike":
				if (queue.state.currentTrack) {
					queue.dislikeTrack();
					actions.showNotification("Track skipped", "info");
				}
				break;
			case "theme":
				actions.openOverlay("themePicker");
				break;
			case "refresh":
				actions.setLoadingStations(true);
				getSession().then((session) => {
					if (session) {
						Effect.runPromise(getStationList(session).pipe(Effect.either)).then(
							(result) => {
								if (result._tag === "Right") {
									const stations = result.right.stations.map((s) => ({
										stationId: s.stationId,
										stationName: s.stationName,
										isQuickMix: s.stationName.toLowerCase().includes("shuffle"),
									}));
									actions.setStations(stations);
									actions.showNotification("Stations refreshed", "success");
								}
								actions.setLoadingStations(false);
							},
						);
					} else {
						actions.setLoadingStations(false);
					}
				});
				break;
			case "help":
				actions.openOverlay("help");
				break;
			case "quit":
				exit();
				break;
		}
	};

	// Handle theme selection
	const handleThemeSelect = (themeName: string) => {
		actions.setTheme(themeName);
		actions.closeOverlay();
		actions.showNotification(`Theme changed to ${themeName}`, "success");
	};

	// Handle station delete
	const handleDeleteStation = () => {
		const selectedStation = state.stations[state.selectedStationIndex];
		if (selectedStation) {
			setPendingDeleteStation({
				stationId: selectedStation.stationId,
				stationName: selectedStation.stationName,
			});
			actions.openOverlay("confirm");
		}
	};

	const handleConfirmDelete = async () => {
		if (!pendingDeleteStation) return;

		actions.closeOverlay();
		const stationName = pendingDeleteStation.stationName;
		const stationToken = pendingDeleteStation.stationId;

		try {
			const session = await getSession();
			if (!session) {
				actions.showNotification("Not logged in", "error");
				setPendingDeleteStation(null);
				return;
			}

			const result = await Effect.runPromise(
				deleteStation(session, { stationToken }).pipe(Effect.either),
			);

			if (result._tag === "Right") {
				// Remove from local state
				const updatedStations = state.stations.filter(
					(s) => s.stationId !== stationToken,
				);
				actions.setStations(updatedStations);
				actions.showNotification(`Deleted "${stationName}"`, "success");

				// Adjust selection if needed
				if (state.selectedStationIndex >= updatedStations.length) {
					actions.selectStation(Math.max(0, updatedStations.length - 1));
				}
			} else {
				actions.showNotification("Failed to delete station", "error");
			}
		} catch {
			actions.showNotification("An error occurred", "error");
		}

		setPendingDeleteStation(null);
	};

	const handleCancelDelete = () => {
		setPendingDeleteStation(null);
		actions.closeOverlay();
	};

	// Handle playing a station - now delegates to useQueue
	const handlePlayStation = (station: {
		stationId: string;
		stationName: string;
	}) => {
		log("handlePlayStation called", station);
		actions.showNotification(`Loading ${station.stationName}...`, "info");
		queue.playStation(station);
	};

	// Wire up keybinds
	useKeybinds(
		{
			// Global
			quit: () => {
				queue.stop();
				exit();
			},
			help: () => actions.openOverlay("help"),
			commandPalette: () => actions.openOverlay("commandPalette"),

			// Navigation
			moveUp: () => actions.moveSelection("up"),
			moveDown: () => actions.moveSelection("down"),
			goToTop: () => actions.moveSelection("top"),
			goToBottom: () => actions.moveSelection("bottom"),
			select: () => {
				log("select keybind triggered", {
					index: state.selectedStationIndex,
					stationCount: state.stations.length,
				});
				const selectedStation = state.stations[state.selectedStationIndex];
				if (selectedStation) {
					log("calling handlePlayStation", selectedStation.stationName);
					handlePlayStation(selectedStation);
				} else {
					log("no station selected");
				}
			},

			// View switching
			search: () => actions.setView("search"),
			nowPlaying: () => {
				if (queue.state.currentTrack) {
					actions.setView("nowPlaying");
				}
			},
			goBack: () => actions.setView("stations"),

			// Playback
			playPause: () => {
				if (queue.state.isPlaying) {
					queue.togglePause();
				}
			},
			like: () => {
				if (queue.state.currentTrack) {
					queue.likeTrack();
					actions.showNotification("Track liked!", "success");
				}
			},
			dislike: () => {
				if (queue.state.currentTrack) {
					queue.dislikeTrack();
					actions.showNotification("Track skipped", "info");
				}
			},

			// Station management
			deleteStation: handleDeleteStation,

			// Debug
			toggleLog: () => {
				if (state.activeOverlay === "log") {
					actions.closeOverlay();
				} else {
					actions.openOverlay("log");
				}
			},

			// Leader key commands
			leader: {
				theme: () => actions.openOverlay("themePicker"),
				bookmarks: () =>
					actions.showNotification("Bookmarks coming soon", "info"),
				refresh: async () => {
					actions.setLoadingStations(true);
					const session = await getSession();
					if (session) {
						const result = await Effect.runPromise(
							getStationList(session).pipe(Effect.either),
						);
						if (result._tag === "Right") {
							const stations = result.right.stations.map((s) => ({
								stationId: s.stationId,
								stationName: s.stationName,
								isQuickMix: s.stationName.toLowerCase().includes("shuffle"),
							}));
							actions.setStations(stations);
							actions.showNotification("Stations refreshed", "success");
						}
					}
					actions.setLoadingStations(false);
				},
			},
		},
		{
			enabled: state.activeOverlay === null && state.currentView !== "search",
		},
	);

	// Handle search result selection - create station from the result
	const handleSearchSelect = async (result: {
		type: "artist" | "song" | "genre";
		name: string;
		musicToken: string;
	}) => {
		actions.showNotification(`Creating station from ${result.name}...`, "info");
		actions.setView("stations");

		// TODO: Implement station creation from search result
		// For now, just show a notification
		actions.showNotification(
			`Station creation from ${result.type} not yet implemented`,
			"info",
		);
	};

	// Render stations view (default/home)
	const renderStationsView = () => {
		const playingId = queue.state.currentStation?.stationId;
		// Adjust max visible based on whether now playing bar is shown
		// Account for: header(3) + footer(1) + outer border(2) + stations title(1) + station footer(2)
		// Now playing adds: border(2) + title(1) + track info(1) + progress(1) = 5
		const nowPlayingHeight = queue.state.currentTrack ? 6 : 0;
		const reservedRows = 9 + nowPlayingHeight;
		return (
			<Box
				flexGrow={1}
				flexDirection="column"
				borderStyle="round"
				marginX={1}
				paddingX={1}
			>
				<Box marginBottom={1}>
					<Text bold color="cyan">
						Stations
					</Text>
				</Box>
				<StationList
					stations={state.stations}
					selectedIndex={state.selectedStationIndex}
					{...(playingId !== undefined && { playingStationId: playingId })}
					maxVisible={Math.max(5, rows - reservedRows)}
				/>
			</Box>
		);
	};

	// Render content based on state and currentView
	const renderContent = () => {
		// Loading state
		if (state.isLoadingStations) {
			return (
				<Box
					flexGrow={1}
					alignItems="center"
					justifyContent="center"
					borderStyle="round"
					marginX={1}
				>
					<Spinner label="Loading stations..." />
				</Box>
			);
		}

		// Not authenticated
		if (!state.isAuthenticated) {
			return (
				<Box
					flexGrow={1}
					flexDirection="column"
					alignItems="center"
					justifyContent="center"
					borderStyle="round"
					marginX={1}
				>
					<Text color={theme.colors.warning}>Not logged in</Text>
					<Text color={theme.colors.textMuted}>
						Run <Text color={theme.colors.accent}>pyxis auth login</Text> to
						authenticate
					</Text>
				</Box>
			);
		}

		// No stations (only applies to stations view)
		if (state.currentView === "stations" && state.stations.length === 0) {
			return (
				<Box
					flexGrow={1}
					alignItems="center"
					justifyContent="center"
					borderStyle="round"
					marginX={1}
				>
					<Text color={theme.colors.textMuted}>No stations found</Text>
				</Box>
			);
		}

		// Switch based on currentView
		switch (state.currentView) {
			case "search":
				return (
					<SearchView
						isVisible={state.currentView === "search"}
						onClose={() => actions.setView("stations")}
						onSelect={handleSearchSelect}
						{...(authSession && { authState: authSession })}
					/>
				);

			case "nowPlaying":
				return (
					<NowPlayingView
						track={queue.state.currentTrack}
						station={queue.state.currentStation}
						queue={queue.state.queue}
						position={queue.state.position}
						isPlaying={queue.state.isPlaying}
					/>
				);

			case "stations":
			default:
				return renderStationsView();
		}
	};

	return (
		<ThemeProvider theme={theme}>
			<Box flexDirection="column" width={columns} height={rows}>
				<Header title="pyxis" theme={initialTheme} />

				{renderContent()}

				{/* Now Playing Bar - persists across all views except nowPlaying view */}
				{queue.state.currentTrack && state.currentView !== "nowPlaying" && (
					<NowPlayingBar
						track={{
							...queue.state.currentTrack,
							trackLength: queue.state.duration,
						}}
						position={queue.state.position}
						isPlaying={queue.state.isPlaying}
					/>
				)}

				{/* Notification display */}
				{state.notification && (
					<Box paddingX={1}>
						<Text
							color={
								state.notification.variant === "error"
									? theme.colors.error
									: state.notification.variant === "success"
										? theme.colors.success
										: theme.colors.accent
							}
						>
							{state.notification.message}
						</Text>
					</Box>
				)}

				<Footer hints={hintsByView[state.currentView]} />

				{/* Overlays */}
				<HelpOverlay
					isVisible={state.activeOverlay === "help"}
					onClose={actions.closeOverlay}
				/>

				<CommandPalette
					isVisible={state.activeOverlay === "commandPalette"}
					commands={commands}
					onSelect={handleCommandSelect}
					onClose={actions.closeOverlay}
				/>

				<ThemePicker
					isVisible={state.activeOverlay === "themePicker"}
					currentTheme={state.themeName}
					onSelect={handleThemeSelect}
					onClose={actions.closeOverlay}
				/>

				<LogViewer
					isVisible={state.activeOverlay === "log"}
					onClose={actions.closeOverlay}
				/>

				<ConfirmDialog
					isVisible={
						state.activeOverlay === "confirm" && pendingDeleteStation !== null
					}
					title="Delete Station"
					message="Are you sure you want to delete"
					detail={`"${pendingDeleteStation?.stationName ?? ""}"?`}
					warning="This action cannot be undone."
					variant="danger"
					onConfirm={handleConfirmDelete}
					onCancel={handleCancelDelete}
				/>
			</Box>
		</ThemeProvider>
	);
};
