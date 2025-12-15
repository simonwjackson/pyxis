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
import { NowPlayingBar } from "./components/playback/index.js";
import { StationList } from "./components/stations/index.js";
import {
	useKeybinds,
	usePlayback,
	usePyxis,
	useTerminalSize,
} from "./hooks/index.js";
import { ThemeProvider, loadTheme } from "./theme/index.js";
import { log } from "./utils/logger.js";
import { getSession } from "../cli/cache/session.js";
import { deleteStation, getPlaylist, getStationList } from "../client.js";
import { getAudioUrl } from "../quality.js";

type AppProps = {
	readonly initialTheme?: string;
};

// Hints for footer based on current view
const hints = [
	{ key: "j/k", action: "navigate" },
	{ key: "⏎", action: "play" },
	{ key: "x", action: "delete" },
	{ key: "?", action: "help" },
	{ key: "q", action: "quit" },
] as const;

// Command palette commands
const createCommands = (
	actions: ReturnType<typeof usePyxis>["actions"],
	exit: () => void,
): readonly Command[] => [
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
	const playback = usePlayback();

	// Memoize commands to avoid recreating on every render
	const commands = useMemo(
		() => createCommands(actions, exit),
		[actions, exit],
	);

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

				// Session found - mark as authenticated
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
				actions.showNotification("Search coming soon", "info");
				break;
			case "like":
				if (state.currentTrack) {
					actions.likeTrack();
					actions.showNotification("Track liked!", "success");
				}
				break;
			case "dislike":
				if (state.currentTrack) {
					actions.dislikeTrack();
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
				actions.showNotification(`Failed to delete station`, "error");
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

	// Handle playing a station - fetch playlist and start playback
	const handlePlayStation = async (station: {
		stationId: string;
		stationName: string;
	}) => {
		log("handlePlayStation called", station);
		actions.playStation(station);
		actions.showNotification(`Loading ${station.stationName}...`, "info");

		try {
			log("getting session...");
			const session = await getSession();
			log("session result", session ? "got session" : "no session");
			if (!session) {
				actions.showNotification("Not logged in", "error");
				return;
			}

			log("fetching playlist for", station.stationId);
			const result = await Effect.runPromise(
				getPlaylist(session, { stationToken: station.stationId }).pipe(
					Effect.either,
				),
			);
			log(
				"playlist result",
				result._tag,
				result._tag === "Right"
					? `${result.right.items.length} items`
					: "error",
			);

			if (result._tag === "Right" && result.right.items.length > 0) {
				const items = result.right.items;
				const firstTrack = items[0];
				log("first track", firstTrack?.songName);
				if (firstTrack) {
					// Set first track as current
					actions.setCurrentTrack({
						trackToken: firstTrack.trackToken,
						songName: firstTrack.songName,
						artistName: firstTrack.artistName,
						albumName: firstTrack.albumName ?? "Unknown Album",
					});
					// Set rest as queue
					const queue = items.slice(1).map((item) => ({
						trackToken: item.trackToken,
						songName: item.songName,
						artistName: item.artistName,
						albumName: item.albumName ?? "Unknown Album",
					}));
					actions.setQueue(queue);

					// Get audio URL and start playback with mpv
					const audioUrl = getAudioUrl(firstTrack, "high");
					log("audio URL", audioUrl ? audioUrl.slice(0, 50) + "..." : "none");
					if (audioUrl) {
						log("calling playback.play");
						playback.play(audioUrl);
						actions.showNotification(
							`Playing: ${firstTrack.songName}`,
							"success",
						);
					} else {
						actions.showNotification("No audio URL available", "error");
					}
				}
			} else {
				log(
					"no tracks or error",
					result._tag === "Left" ? result.left : "empty",
				);
				actions.showNotification("No tracks available", "error");
			}
		} catch {
			actions.showNotification("Failed to load playlist", "error");
		}
	};

	// Wire up keybinds
	useKeybinds(
		{
			// Global
			quit: () => {
				playback.stop();
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

			// Playback
			playPause: () => {
				if (playback.state.isPlaying) {
					playback.togglePause();
				}
			},
			like: () => {
				if (state.currentTrack) {
					actions.likeTrack();
					actions.showNotification("Track liked!", "success");
				}
			},
			dislike: () => {
				if (state.currentTrack) {
					actions.dislikeTrack();
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
		{ enabled: state.activeOverlay === null },
	);

	// Render content based on state
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

		// No stations
		if (state.stations.length === 0) {
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

		// Show station list
		const playingId = state.currentStation?.stationId;
		// Adjust max visible based on whether now playing bar is shown
		// Account for: header(3) + footer(1) + outer border(2) + stations title(1) + station footer(2)
		// Now playing adds: border(2) + title(1) + track info(1) + progress(1) = 5
		const nowPlayingHeight = state.currentTrack ? 6 : 0;
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
				{state.currentTrack && (
					<NowPlayingBar
						track={state.currentTrack}
						position={state.playbackPosition}
						isPlaying={playback.state.isPlaying}
					/>
				)}
			</Box>
		);
	};

	return (
		<ThemeProvider theme={theme}>
			<Box flexDirection="column" width={columns} height={rows}>
				<Header title="pyxis" theme={initialTheme} />

				{renderContent()}

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

				<Footer hints={hints} />

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
