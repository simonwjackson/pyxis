import { Box, Text, useInput } from "ink";
import { Spinner } from "@inkjs/ui";
import { type FC, useState, useCallback, useEffect, useMemo } from "react";
import { Effect } from "effect";
import { useTheme } from "../../theme/index.js";
import { Panel } from "../layout/index.js";
import { getStation } from "../../../client.js";
import type {
	GetStationResponse,
	StationSeed,
	StationFeedback,
} from "../../../types/api.js";

type AuthState = {
	readonly syncTime: number;
	readonly partnerId: string;
	readonly partnerAuthToken: string;
	readonly userAuthToken: string;
	readonly userId: string;
};

type StationDetailsViewProps = {
	readonly isVisible: boolean;
	readonly onClose: () => void;
	readonly stationToken: string | null;
	readonly stationName: string | null;
	readonly onNotification?: (
		message: string,
		variant: "success" | "error" | "info",
	) => void;
	readonly authState?: AuthState;
};

type LoadingState =
	| { readonly status: "idle" }
	| { readonly status: "loading" }
	| { readonly status: "success"; readonly data: GetStationResponse }
	| { readonly status: "error"; readonly message: string };

type Section = "info" | "seeds" | "feedback";

/**
 * StationDetailsView - Display detailed station information
 *
 * Layout (Info section):
 * ```
 * Station Details - Rock Radio
 * ╭──────────────────────────────────────────────────────────────────────────╮
 * │  [Info]  Seeds  Feedback                                                 │
 * │                                                                          │
 * │  Station Name: Rock Radio                                                │
 * │  Station ID: 123456789                                                   │
 * │                                                                          │
 * │  Seeds: 3 artists, 2 songs                                              │
 * │  Feedback: 10 thumbs up, 2 thumbs down                                  │
 * ╰──────────────────────────────────────────────────────────────────────────╯
 * ```
 *
 * Layout (Seeds section):
 * ```
 * │  Info  [Seeds]  Feedback                                                 │
 * │                                                                          │
 * │  Artists                                                                 │
 * │  > Pink Floyd                                                            │
 * │    Led Zeppelin                                                          │
 * │                                                                          │
 * │  Songs                                                                   │
 * │    "Stairway to Heaven" by Led Zeppelin                                 │
 * ```
 *
 * Layout (Feedback section):
 * ```
 * │  Info  Seeds  [Feedback]                                                 │
 * │                                                                          │
 * │  Thumbs Up (10)                                                          │
 * │  > "Comfortably Numb" by Pink Floyd                                     │
 * │    "Time" by Pink Floyd                                                  │
 * │                                                                          │
 * │  Thumbs Down (2)                                                         │
 * │    "Some Song" by Some Artist                                           │
 * ```
 *
 * Keybinds:
 * - Tab or h/l: Switch between sections
 * - j/k or arrows: Navigate within current section
 * - g/G: Jump to first/last in section
 * - Escape: Close view
 */
export const StationDetailsView: FC<StationDetailsViewProps> = ({
	isVisible,
	onClose,
	stationToken,
	stationName,
	onNotification,
	authState,
}) => {
	const theme = useTheme();
	const [loadingState, setLoadingState] = useState<LoadingState>({
		status: "idle",
	});
	const [activeSection, setActiveSection] = useState<Section>("info");
	const [selectedIndex, setSelectedIndex] = useState(0);

	const sections = ["info", "seeds", "feedback"] as const;

	// Extract seeds from station data
	const seeds = useMemo(() => {
		if (loadingState.status !== "success") {
			return { artists: [], songs: [] };
		}

		const artists: readonly StationSeed[] =
			loadingState.data.music?.artists ?? [];
		const songs: readonly StationSeed[] = loadingState.data.music?.songs ?? [];

		return { artists, songs };
	}, [loadingState]);

	// Flatten seeds for navigation
	const flatSeeds = useMemo(() => {
		const items: Array<{
			readonly type: "artist" | "song";
			readonly seed: StationSeed;
		}> = [];

		for (const artist of seeds.artists) {
			items.push({ type: "artist", seed: artist });
		}
		for (const song of seeds.songs) {
			items.push({ type: "song", seed: song });
		}

		return items;
	}, [seeds]);

	// Extract feedback from station data
	const feedback = useMemo(() => {
		if (loadingState.status !== "success") {
			return { thumbsUp: [], thumbsDown: [] };
		}

		const thumbsUp: readonly StationFeedback[] =
			loadingState.data.feedback?.thumbsUp ?? [];
		const thumbsDown: readonly StationFeedback[] =
			loadingState.data.feedback?.thumbsDown ?? [];

		return { thumbsUp, thumbsDown };
	}, [loadingState]);

	// Flatten feedback for navigation
	const flatFeedback = useMemo(() => {
		const items: Array<{
			readonly type: "up" | "down";
			readonly feedback: StationFeedback;
		}> = [];

		for (const item of feedback.thumbsUp) {
			items.push({ type: "up", feedback: item });
		}
		for (const item of feedback.thumbsDown) {
			items.push({ type: "down", feedback: item });
		}

		return items;
	}, [feedback]);

	// Get max index for current section
	const getMaxIndex = useCallback(() => {
		switch (activeSection) {
			case "info":
				return 0; // Info section has no navigable items
			case "seeds":
				return Math.max(0, flatSeeds.length - 1);
			case "feedback":
				return Math.max(0, flatFeedback.length - 1);
		}
	}, [activeSection, flatSeeds.length, flatFeedback.length]);

	// Fetch station details
	const fetchStationDetails = useCallback(async () => {
		if (!authState || !stationToken) {
			setLoadingState({ status: "error", message: "No station selected" });
			return;
		}

		setLoadingState({ status: "loading" });

		const program = getStation(authState, {
			stationToken,
			includeExtendedAttributes: true,
		});

		const result = await Effect.runPromiseExit(program);

		if (result._tag === "Success") {
			setLoadingState({ status: "success", data: result.value });
		} else {
			setLoadingState({
				status: "error",
				message: "Failed to load station details",
			});
			onNotification?.("Failed to load station details", "error");
		}
	}, [authState, stationToken, onNotification]);

	// Fetch station details when view becomes visible
	useEffect(() => {
		if (!isVisible) {
			return;
		}

		// Reset state
		setActiveSection("info");
		setSelectedIndex(0);

		fetchStationDetails();
	}, [isVisible, fetchStationDetails]);

	// Reset selected index when switching sections
	useEffect(() => {
		setSelectedIndex(0);
	}, [activeSection]);

	// Handle keyboard input
	useInput(
		(input, key) => {
			// Escape to close
			if (key.escape) {
				onClose();
				return;
			}

			// Tab or l to switch to next section
			if (key.tab || input === "l" || key.rightArrow) {
				setActiveSection((current) => {
					const currentIndex = sections.indexOf(current);
					const nextIndex = (currentIndex + 1) % sections.length;
					return sections[nextIndex] ?? "info";
				});
				return;
			}

			// h or left arrow to switch to previous section
			if (input === "h" || key.leftArrow) {
				setActiveSection((current) => {
					const currentIndex = sections.indexOf(current);
					const prevIndex =
						(currentIndex - 1 + sections.length) % sections.length;
					return sections[prevIndex] ?? "info";
				});
				return;
			}

			// Navigation within section
			const maxIndex = getMaxIndex();

			if (input === "j" || key.downArrow) {
				setSelectedIndex((prev) => Math.min(prev + 1, maxIndex));
				return;
			}

			if (input === "k" || key.upArrow) {
				setSelectedIndex((prev) => Math.max(prev - 1, 0));
				return;
			}

			if (input === "g") {
				setSelectedIndex(0);
				return;
			}

			if (input === "G") {
				setSelectedIndex(maxIndex);
				return;
			}
		},
		{ isActive: isVisible },
	);

	if (!isVisible) {
		return null;
	}

	const truncate = (text: string, maxLen: number): string =>
		text.length > maxLen ? `${text.slice(0, maxLen - 1)}…` : text;

	// Render section tabs
	const renderTabs = () => (
		<Box marginBottom={1}>
			{sections.map((section, i) => (
				<Text
					key={section}
					color={
						activeSection === section
							? theme.colors.accent
							: theme.colors.textMuted
					}
					bold={activeSection === section}
				>
					{activeSection === section
						? `[${section.charAt(0).toUpperCase() + section.slice(1)}]`
						: section.charAt(0).toUpperCase() + section.slice(1)}
					{i < sections.length - 1 ? "  " : ""}
				</Text>
			))}
		</Box>
	);

	// Render info section
	const renderInfoSection = () => {
		if (loadingState.status !== "success") {
			return null;
		}

		const data = loadingState.data;
		const artistCount = seeds.artists.length;
		const songCount = seeds.songs.length;
		const thumbsUpCount = feedback.thumbsUp.length;
		const thumbsDownCount = feedback.thumbsDown.length;

		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text color={theme.colors.secondary}>Station Name: </Text>
					<Text color={theme.colors.text} bold>
						{data.stationName}
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text color={theme.colors.secondary}>Station ID: </Text>
					<Text color={theme.colors.textMuted}>{data.stationId}</Text>
				</Box>

				<Box marginBottom={1}>
					<Text color={theme.colors.secondary}>Seeds: </Text>
					<Text color={theme.colors.text}>
						{artistCount} artist{artistCount !== 1 ? "s" : ""}, {songCount} song
						{songCount !== 1 ? "s" : ""}
					</Text>
				</Box>

				<Box>
					<Text color={theme.colors.secondary}>Feedback: </Text>
					<Text color={theme.colors.success}>{thumbsUpCount} thumbs up</Text>
					<Text color={theme.colors.textMuted}>, </Text>
					<Text color={theme.colors.error}>{thumbsDownCount} thumbs down</Text>
				</Box>
			</Box>
		);
	};

	// Render seeds section
	const renderSeedsSection = () => {
		if (loadingState.status !== "success") {
			return null;
		}

		if (flatSeeds.length === 0) {
			return (
				<Text color={theme.colors.textMuted}>
					No seeds found for this station.
				</Text>
			);
		}

		// Calculate global index for each seed
		const getSeedGlobalIndex = (
			type: "artist" | "song",
			localIndex: number,
		): number => {
			if (type === "artist") return localIndex;
			return seeds.artists.length + localIndex;
		};

		return (
			<Box flexDirection="column">
				{/* Artists section */}
				{seeds.artists.length > 0 && (
					<Box flexDirection="column" marginBottom={1}>
						<Text color={theme.colors.secondary} bold>
							Artists
						</Text>
						{seeds.artists.map((artist, idx) => {
							const globalIdx = getSeedGlobalIndex("artist", idx);
							const isSelected = globalIdx === selectedIndex;
							return (
								<Box key={artist.seedId}>
									<Text
										color={
											isSelected ? theme.colors.accent : theme.colors.textMuted
										}
									>
										{isSelected ? "> " : "  "}
									</Text>
									<Text
										color={
											isSelected ? theme.colors.text : theme.colors.secondary
										}
										bold={isSelected}
									>
										{truncate(artist.artistName ?? "Unknown Artist", 50)}
									</Text>
								</Box>
							);
						})}
					</Box>
				)}

				{/* Songs section */}
				{seeds.songs.length > 0 && (
					<Box flexDirection="column">
						<Text color={theme.colors.secondary} bold>
							Songs
						</Text>
						{seeds.songs.map((song, idx) => {
							const globalIdx = getSeedGlobalIndex("song", idx);
							const isSelected = globalIdx === selectedIndex;
							return (
								<Box key={song.seedId}>
									<Text
										color={
											isSelected ? theme.colors.accent : theme.colors.textMuted
										}
									>
										{isSelected ? "> " : "  "}
									</Text>
									<Text
										color={
											isSelected ? theme.colors.text : theme.colors.secondary
										}
										bold={isSelected}
									>
										"{truncate(song.songName ?? "Unknown Song", 30)}"
									</Text>
									{song.artistName && (
										<Text color={theme.colors.textMuted}>
											{" by "}
											{truncate(song.artistName, 25)}
										</Text>
									)}
								</Box>
							);
						})}
					</Box>
				)}
			</Box>
		);
	};

	// Render feedback section
	const renderFeedbackSection = () => {
		if (loadingState.status !== "success") {
			return null;
		}

		if (flatFeedback.length === 0) {
			return (
				<Text color={theme.colors.textMuted}>
					No feedback found for this station.
				</Text>
			);
		}

		// Calculate global index for each feedback item
		const getFeedbackGlobalIndex = (
			type: "up" | "down",
			localIndex: number,
		): number => {
			if (type === "up") return localIndex;
			return feedback.thumbsUp.length + localIndex;
		};

		return (
			<Box flexDirection="column">
				{/* Thumbs Up section */}
				{feedback.thumbsUp.length > 0 && (
					<Box flexDirection="column" marginBottom={1}>
						<Text color={theme.colors.success} bold>
							Thumbs Up ({feedback.thumbsUp.length})
						</Text>
						{feedback.thumbsUp.map((item, idx) => {
							const globalIdx = getFeedbackGlobalIndex("up", idx);
							const isSelected = globalIdx === selectedIndex;
							return (
								<Box key={item.feedbackId}>
									<Text
										color={
											isSelected ? theme.colors.accent : theme.colors.textMuted
										}
									>
										{isSelected ? "> " : "  "}
									</Text>
									<Text color={theme.colors.success}>+ </Text>
									<Text
										color={
											isSelected ? theme.colors.text : theme.colors.secondary
										}
										bold={isSelected}
									>
										"{truncate(item.songName, 30)}"
									</Text>
									<Text color={theme.colors.textMuted}>
										{" by "}
										{truncate(item.artistName, 25)}
									</Text>
								</Box>
							);
						})}
					</Box>
				)}

				{/* Thumbs Down section */}
				{feedback.thumbsDown.length > 0 && (
					<Box flexDirection="column">
						<Text color={theme.colors.error} bold>
							Thumbs Down ({feedback.thumbsDown.length})
						</Text>
						{feedback.thumbsDown.map((item, idx) => {
							const globalIdx = getFeedbackGlobalIndex("down", idx);
							const isSelected = globalIdx === selectedIndex;
							return (
								<Box key={item.feedbackId}>
									<Text
										color={
											isSelected ? theme.colors.accent : theme.colors.textMuted
										}
									>
										{isSelected ? "> " : "  "}
									</Text>
									<Text color={theme.colors.error}>- </Text>
									<Text
										color={
											isSelected ? theme.colors.text : theme.colors.secondary
										}
										bold={isSelected}
									>
										"{truncate(item.songName, 30)}"
									</Text>
									<Text color={theme.colors.textMuted}>
										{" by "}
										{truncate(item.artistName, 25)}
									</Text>
								</Box>
							);
						})}
					</Box>
				)}
			</Box>
		);
	};

	// Render section content based on active section
	const renderSectionContent = () => {
		switch (activeSection) {
			case "info":
				return renderInfoSection();
			case "seeds":
				return renderSeedsSection();
			case "feedback":
				return renderFeedbackSection();
		}
	};

	return (
		<Box flexDirection="column" flexGrow={1} marginX={1}>
			<Panel
				title={
					stationName ? `Station Details - ${stationName}` : "Station Details"
				}
				flexGrow={1}
			>
				{/* Loading state */}
				{loadingState.status === "loading" && (
					<Box>
						<Spinner label="Loading station details..." />
					</Box>
				)}

				{/* Error state */}
				{loadingState.status === "error" && (
					<Text color={theme.colors.error}>{loadingState.message}</Text>
				)}

				{/* Success state */}
				{loadingState.status === "success" && (
					<Box flexDirection="column">
						{renderTabs()}
						{renderSectionContent()}
					</Box>
				)}
			</Panel>
		</Box>
	);
};

export type { StationDetailsViewProps };
