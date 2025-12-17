import { Box, Text, useInput } from "ink";
import { Spinner } from "@inkjs/ui";
import { type FC, useEffect, useState } from "react";
import { Effect } from "effect";
import { useTheme } from "../../theme/provider.js";
import { getSession } from "../../../cli/cache/session.js";
import { explainTrack } from "../../../client.js";

type Track = {
	readonly trackToken: string;
	readonly songName: string;
	readonly artistName: string;
	readonly albumName: string;
	readonly albumArtUrl?: string;
	readonly trackLength?: number;
	readonly rating?: number;
};

type TrackExplanation = {
	readonly focusTraitId: string;
	readonly focusTraitName: string;
};

type TrackInfoOverlayProps = {
	readonly track: Track | null;
	readonly stationName: string | null;
	readonly onClose: () => void;
	readonly isVisible: boolean;
};

// Border characters for round style
const BORDER = {
	topLeft: "╭",
	topRight: "╮",
	bottomLeft: "╰",
	bottomRight: "╯",
	horizontal: "─",
	vertical: "│",
} as const;

const CONTENT_WIDTH = 60;

type LoadingState =
	| { readonly status: "idle" }
	| { readonly status: "loading" }
	| {
			readonly status: "success";
			readonly explanations: readonly TrackExplanation[];
	  }
	| { readonly status: "error"; readonly message: string };

/**
 * Track Info Overlay - Shows track details and Music Genome attributes
 *
 * Layout:
 * ```
 * ╭─ Track Info ────────────────────────────────────────────────╮
 * │                                                              │
 * │  Comfortably Numb                                            │
 * │  Pink Floyd · The Wall                                       │
 * │                                                              │
 * │  Playing on: Pink Floyd Radio                                │
 * │  Rating: ♥ Liked                                             │
 * │                                                              │
 * │  Music Genome Traits                                         │
 * │  ─────────────────────                                       │
 * │  • Classic rock roots                                        │
 * │  • Psychedelic influences                                    │
 * │  • Extended guitar solos                                     │
 * │  • Progressive song structure                                │
 * │                                                              │
 * │                              Esc or i to close               │
 * ╰──────────────────────────────────────────────────────────────╯
 * ```
 */
export const TrackInfoOverlay: FC<TrackInfoOverlayProps> = ({
	track,
	stationName,
	onClose,
	isVisible,
}) => {
	const theme = useTheme();
	const [loadingState, setLoadingState] = useState<LoadingState>({
		status: "idle",
	});

	// Fetch track explanations when overlay becomes visible
	useEffect(() => {
		if (!isVisible || !track) {
			setLoadingState({ status: "idle" });
			return;
		}

		const fetchExplanations = async () => {
			setLoadingState({ status: "loading" });

			try {
				const session = await getSession();
				if (!session) {
					setLoadingState({ status: "error", message: "Not logged in" });
					return;
				}

				const result = await Effect.runPromise(
					explainTrack(session, track.trackToken).pipe(Effect.either),
				);

				if (result._tag === "Right") {
					setLoadingState({
						status: "success",
						explanations: result.right.explanations,
					});
				} else {
					setLoadingState({
						status: "error",
						message: "Failed to load track info",
					});
				}
			} catch {
				setLoadingState({ status: "error", message: "An error occurred" });
			}
		};

		fetchExplanations();
	}, [isVisible, track]);

	useInput(
		(input, key) => {
			if (key.escape || input === "i" || input === "q") {
				onClose();
			}
		},
		{ isActive: isVisible },
	);

	if (!isVisible || !track) {
		return null;
	}

	const title = "Track Info";
	const titleLineWidth = CONTENT_WIDTH - title.length - 3;

	// Truncate text to fit within content width
	const truncate = (text: string, maxLen: number): string =>
		text.length > maxLen ? `${text.slice(0, maxLen - 1)}…` : text;

	// Get rating display
	const getRatingDisplay = (): string => {
		if (track.rating === 1) return "♥ Liked";
		return "Not rated";
	};

	// Format duration
	const formatDuration = (seconds?: number): string => {
		if (!seconds) return "Unknown";
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${String(mins)}:${String(secs).padStart(2, "0")}`;
	};

	return (
		<Box
			flexDirection="column"
			alignItems="center"
			justifyContent="center"
			width="100%"
			height="100%"
			position="absolute"
		>
			<Box flexDirection="column">
				{/* Top border with title */}
				<Text>
					{BORDER.topLeft}
					{BORDER.horizontal}{" "}
					<Text bold color="cyan">
						{title}
					</Text>{" "}
					{BORDER.horizontal.repeat(Math.max(0, titleLineWidth))}
					{BORDER.topRight}
				</Text>

				{/* Empty line */}
				<Text>
					{BORDER.vertical}
					{" ".repeat(CONTENT_WIDTH)}
					{BORDER.vertical}
				</Text>

				{/* Track title */}
				<Text>
					{BORDER.vertical}
					{"  "}
					<Text bold color={theme.colors.text}>
						{truncate(track.songName, CONTENT_WIDTH - 4)}
					</Text>
					{" ".repeat(Math.max(0, CONTENT_WIDTH - track.songName.length - 2))}
					{BORDER.vertical}
				</Text>

				{/* Artist · Album */}
				<Text>
					{BORDER.vertical}
					{"  "}
					<Text color={theme.colors.textMuted}>
						{truncate(
							`${track.artistName} · ${track.albumName}`,
							CONTENT_WIDTH - 4,
						)}
					</Text>
					{" ".repeat(
						Math.max(
							0,
							CONTENT_WIDTH -
								`${track.artistName} · ${track.albumName}`.length -
								2,
						),
					)}
					{BORDER.vertical}
				</Text>

				{/* Empty line */}
				<Text>
					{BORDER.vertical}
					{" ".repeat(CONTENT_WIDTH)}
					{BORDER.vertical}
				</Text>

				{/* Station name */}
				{stationName && (
					<Text>
						{BORDER.vertical}
						{"  "}
						<Text color={theme.colors.textMuted}>Playing on: </Text>
						<Text color={theme.colors.secondary}>
							{truncate(stationName, 40)}
						</Text>
						{" ".repeat(
							Math.max(
								0,
								CONTENT_WIDTH - `Playing on: ${stationName}`.length - 2,
							),
						)}
						{BORDER.vertical}
					</Text>
				)}

				{/* Duration */}
				{track.trackLength && (
					<Text>
						{BORDER.vertical}
						{"  "}
						<Text color={theme.colors.textMuted}>Duration: </Text>
						<Text color={theme.colors.text}>
							{formatDuration(track.trackLength)}
						</Text>
						{" ".repeat(
							Math.max(
								0,
								CONTENT_WIDTH -
									`Duration: ${formatDuration(track.trackLength)}`.length -
									2,
							),
						)}
						{BORDER.vertical}
					</Text>
				)}

				{/* Rating */}
				<Text>
					{BORDER.vertical}
					{"  "}
					<Text color={theme.colors.textMuted}>Rating: </Text>
					<Text
						color={
							track.rating === 1 ? theme.colors.liked : theme.colors.textMuted
						}
					>
						{getRatingDisplay()}
					</Text>
					{" ".repeat(
						Math.max(
							0,
							CONTENT_WIDTH - `Rating: ${getRatingDisplay()}`.length - 2,
						),
					)}
					{BORDER.vertical}
				</Text>

				{/* Empty line */}
				<Text>
					{BORDER.vertical}
					{" ".repeat(CONTENT_WIDTH)}
					{BORDER.vertical}
				</Text>

				{/* Music Genome section header */}
				<Text>
					{BORDER.vertical}
					{"  "}
					<Text bold color={theme.colors.accent}>
						Music Genome Traits
					</Text>
					{" ".repeat(CONTENT_WIDTH - "Music Genome Traits".length - 2)}
					{BORDER.vertical}
				</Text>

				{/* Underline */}
				<Text>
					{BORDER.vertical}
					{"  "}
					<Text color={theme.colors.textMuted}>{"─".repeat(20)}</Text>
					{" ".repeat(CONTENT_WIDTH - 22)}
					{BORDER.vertical}
				</Text>

				{/* Loading state */}
				{loadingState.status === "loading" && (
					<Text>
						{BORDER.vertical}
						{"  "}
						<Spinner label="Loading traits..." />
						{" ".repeat(CONTENT_WIDTH - 20)}
						{BORDER.vertical}
					</Text>
				)}

				{/* Error state */}
				{loadingState.status === "error" && (
					<Text>
						{BORDER.vertical}
						{"  "}
						<Text color={theme.colors.error}>{loadingState.message}</Text>
						{" ".repeat(
							Math.max(0, CONTENT_WIDTH - loadingState.message.length - 2),
						)}
						{BORDER.vertical}
					</Text>
				)}

				{/* Success state - no explanations */}
				{loadingState.status === "success" &&
					loadingState.explanations.length === 0 && (
						<Text>
							{BORDER.vertical}
							{"  "}
							<Text color={theme.colors.textMuted}>No traits available</Text>
							{" ".repeat(CONTENT_WIDTH - "No traits available".length - 2)}
							{BORDER.vertical}
						</Text>
					)}

				{/* Success state - show explanations */}
				{loadingState.status === "success" &&
					loadingState.explanations.slice(0, 8).map((exp) => (
						<Text key={exp.focusTraitId}>
							{BORDER.vertical}
							{"  "}
							<Text color={theme.colors.secondary}>• </Text>
							<Text color={theme.colors.text}>
								{truncate(exp.focusTraitName, CONTENT_WIDTH - 6)}
							</Text>
							{" ".repeat(
								Math.max(0, CONTENT_WIDTH - exp.focusTraitName.length - 4),
							)}
							{BORDER.vertical}
						</Text>
					))}

				{/* Empty line */}
				<Text>
					{BORDER.vertical}
					{" ".repeat(CONTENT_WIDTH)}
					{BORDER.vertical}
				</Text>

				{/* Footer hint */}
				<Text>
					{BORDER.vertical}
					{" ".repeat(Math.floor((CONTENT_WIDTH - 20) / 2))}
					<Text color={theme.colors.textMuted}>Esc or i to close</Text>
					{" ".repeat(Math.ceil((CONTENT_WIDTH - 20) / 2))}
					{BORDER.vertical}
				</Text>

				{/* Bottom border */}
				<Text>
					{BORDER.bottomLeft}
					{BORDER.horizontal.repeat(CONTENT_WIDTH)}
					{BORDER.bottomRight}
				</Text>
			</Box>
		</Box>
	);
};

export type { TrackInfoOverlayProps };
