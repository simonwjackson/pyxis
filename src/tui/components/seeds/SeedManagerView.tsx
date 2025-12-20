import { Box, Text, useInput } from "ink";
import { Spinner, TextInput } from "@inkjs/ui";
import {
	type FC,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Effect } from "effect";
import { useTheme } from "../../theme/index.js";
import { Panel } from "../layout/index.js";
import { getStation, addMusic, deleteMusic } from "../../../client.js";
import { search } from "../../../api/music.js";
import type {
	StationSeed,
	GetStationResponse,
	MusicSearchResponse,
} from "../../../types/api.js";

type AuthState = {
	readonly syncTime: number;
	readonly partnerId: string;
	readonly partnerAuthToken: string;
	readonly userAuthToken: string;
	readonly userId: string;
};

type SeedManagerViewProps = {
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

type SeedItem =
	| { readonly type: "artist"; readonly data: StationSeed }
	| { readonly type: "song"; readonly data: StationSeed };

type SearchResult = {
	readonly type: "artist" | "song";
	readonly name: string;
	readonly artist?: string;
	readonly musicToken: string;
};

type LoadingState =
	| { readonly status: "idle" }
	| { readonly status: "loading" }
	| { readonly status: "success"; readonly items: readonly SeedItem[] }
	| { readonly status: "error"; readonly message: string };

type SearchState =
	| { readonly status: "idle" }
	| { readonly status: "loading" }
	| { readonly status: "success"; readonly results: readonly SearchResult[] }
	| { readonly status: "error"; readonly message: string };

type FocusedPanel = "seeds" | "search";

const DEBOUNCE_MS = 300;

/**
 * SeedManagerView - Manage station seeds (artists and songs)
 *
 * Layout:
 * ```
 * Seeds - My Station
 * ╭──────────────────────────────────────────────────────────────────────────╮
 * │  Current Seeds                      │  Add Seed                          │
 * │                                     │                                    │
 * │  Artists                            │  / search...                       │
 * │  > Pink Floyd                       │                                    │
 * │    Radiohead                        │  Artists                           │
 * │                                     │  > Led Zeppelin                    │
 * │  Songs                              │    The Beatles                     │
 * │    Comfortably Numb                 │                                    │
 * │    Paranoid Android                 │  Songs                             │
 * │                                     │    Stairway to Heaven              │
 * ╰──────────────────────────────────────────────────────────────────────────╯
 * ```
 *
 * Features:
 * - Tab to switch between seeds list and search panel
 * - j/k navigation in current panel
 * - x or d to delete selected seed (in seeds panel)
 * - Enter to add selected search result as seed (in search panel)
 * - Escape to close view
 * - / or i to focus search input
 */
export const SeedManagerView: FC<SeedManagerViewProps> = ({
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
	const [searchState, setSearchState] = useState<SearchState>({
		status: "idle",
	});
	const [seedSelectedIndex, setSeedSelectedIndex] = useState(0);
	const [searchSelectedIndex, setSearchSelectedIndex] = useState(0);
	const [focusedPanel, setFocusedPanel] = useState<FocusedPanel>("seeds");
	const [searchQuery, setSearchQuery] = useState("");
	const [isSearchInputFocused, setIsSearchInputFocused] = useState(false);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Flatten seeds for navigation
	const flatSeeds = useMemo(() => {
		if (loadingState.status !== "success") return [];
		return loadingState.items;
	}, [loadingState]);

	// Flatten search results for navigation
	const flatSearchResults = useMemo(() => {
		if (searchState.status !== "success") return [];
		return searchState.results;
	}, [searchState]);

	// Group seeds by type for display
	const groupedSeeds = useMemo(() => {
		if (loadingState.status !== "success") return { artists: [], songs: [] };

		const artists: SeedItem[] = [];
		const songs: SeedItem[] = [];

		for (const item of loadingState.items) {
			if (item.type === "artist") {
				artists.push(item);
			} else {
				songs.push(item);
			}
		}

		return { artists, songs };
	}, [loadingState]);

	// Group search results by type for display
	const groupedSearchResults = useMemo(() => {
		if (searchState.status !== "success") return { artists: [], songs: [] };

		const artists: SearchResult[] = [];
		const songs: SearchResult[] = [];

		for (const result of searchState.results) {
			if (result.type === "artist") {
				artists.push(result);
			} else {
				songs.push(result);
			}
		}

		return { artists, songs };
	}, [searchState]);

	// Parse API response into SearchResult array
	const parseSearchResponse = useCallback(
		(response: MusicSearchResponse): readonly SearchResult[] => {
			const results: SearchResult[] = [];

			// Add artists
			if (response.artists) {
				for (const artist of response.artists) {
					results.push({
						type: "artist",
						name: artist.artistName,
						musicToken: artist.musicToken,
					});
				}
			}

			// Add songs
			if (response.songs) {
				for (const song of response.songs) {
					results.push({
						type: "song",
						name: song.songName,
						artist: song.artistName,
						musicToken: song.musicToken,
					});
				}
			}

			return results;
		},
		[],
	);

	// Fetch station seeds
	const fetchSeeds = useCallback(async () => {
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
			const response: GetStationResponse = result.value;
			const items: SeedItem[] = [];

			// Add artist seeds
			if (response.music?.artists) {
				for (const artist of response.music.artists) {
					items.push({ type: "artist", data: artist });
				}
			}

			// Add song seeds
			if (response.music?.songs) {
				for (const song of response.music.songs) {
					items.push({ type: "song", data: song });
				}
			}

			setLoadingState({ status: "success", items });
			setSeedSelectedIndex(0);
		} else {
			setLoadingState({ status: "error", message: "Failed to load seeds" });
		}
	}, [authState, stationToken]);

	// Perform search
	const performSearch = useCallback(
		async (searchText: string) => {
			if (!searchText.trim() || !authState) {
				setSearchState({ status: "idle" });
				return;
			}

			setSearchState({ status: "loading" });

			const program = search(authState, { searchText });
			const result = await Effect.runPromiseExit(program);

			if (result._tag === "Success") {
				const results = parseSearchResponse(result.value);
				setSearchState({ status: "success", results });
				setSearchSelectedIndex(0);
			} else {
				setSearchState({ status: "error", message: "Search failed" });
			}
		},
		[authState, parseSearchResponse],
	);

	// Debounced search effect
	useEffect(() => {
		if (debounceRef.current) {
			clearTimeout(debounceRef.current);
		}

		if (!searchQuery.trim()) {
			setSearchState({ status: "idle" });
			return;
		}

		debounceRef.current = setTimeout(() => {
			performSearch(searchQuery);
		}, DEBOUNCE_MS);

		return () => {
			if (debounceRef.current) {
				clearTimeout(debounceRef.current);
			}
		};
	}, [searchQuery, performSearch]);

	// Fetch seeds when view becomes visible
	useEffect(() => {
		if (!isVisible) {
			return;
		}

		// Reset state
		setSearchQuery("");
		setSearchState({ status: "idle" });
		setSeedSelectedIndex(0);
		setSearchSelectedIndex(0);
		setFocusedPanel("seeds");
		setIsSearchInputFocused(false);

		fetchSeeds();
	}, [isVisible, fetchSeeds]);

	// Handle search query change
	const handleSearchQueryChange = useCallback((value: string) => {
		setSearchQuery(value);
	}, []);

	// Add seed from search result
	const handleAddSeed = useCallback(async () => {
		if (searchState.status !== "success" || !authState || !stationToken) return;

		const result = flatSearchResults[searchSelectedIndex];
		if (!result) return;

		onNotification?.(`Adding ${result.name}...`, "info");

		const program = addMusic(authState, {
			stationToken,
			musicToken: result.musicToken,
		});

		const response = await Effect.runPromiseExit(program);

		if (response._tag === "Success") {
			onNotification?.(`Added "${result.name}" as seed`, "success");
			// Refresh seeds list
			fetchSeeds();
		} else {
			onNotification?.("Failed to add seed", "error");
		}
	}, [
		searchState,
		authState,
		stationToken,
		flatSearchResults,
		searchSelectedIndex,
		onNotification,
		fetchSeeds,
	]);

	// Delete selected seed
	const handleDeleteSeed = useCallback(async () => {
		if (loadingState.status !== "success" || !authState) return;

		const item = flatSeeds[seedSelectedIndex];
		if (!item) return;

		const name =
			item.type === "artist" ? item.data.artistName : item.data.songName;

		onNotification?.(`Removing ${name}...`, "info");

		const program = deleteMusic(authState, {
			seedId: item.data.seedId,
		});

		const response = await Effect.runPromiseExit(program);

		if (response._tag === "Success") {
			// Remove from local state
			const newItems = loadingState.items.filter(
				(_, i) => i !== seedSelectedIndex,
			);
			setLoadingState({ status: "success", items: newItems });

			// Adjust selection
			if (seedSelectedIndex >= newItems.length && newItems.length > 0) {
				setSeedSelectedIndex(newItems.length - 1);
			}

			onNotification?.(`Removed "${name}"`, "success");
		} else {
			onNotification?.("Failed to remove seed", "error");
		}
	}, [loadingState, authState, flatSeeds, seedSelectedIndex, onNotification]);

	// Handle keyboard input
	useInput(
		(input, key) => {
			// Escape to close
			if (key.escape) {
				if (isSearchInputFocused) {
					setIsSearchInputFocused(false);
					return;
				}
				onClose();
				return;
			}

			// When search input is focused, handle special keys
			if (isSearchInputFocused) {
				if (key.tab) {
					setIsSearchInputFocused(false);
					setFocusedPanel("seeds");
					return;
				}
				if (key.downArrow && flatSearchResults.length > 0) {
					setIsSearchInputFocused(false);
					return;
				}
				// Let TextInput handle other keys
				return;
			}

			// Tab to switch panels
			if (key.tab) {
				if (focusedPanel === "seeds") {
					setFocusedPanel("search");
					setIsSearchInputFocused(true);
				} else {
					setFocusedPanel("seeds");
				}
				return;
			}

			// / or i to focus search input
			if (input === "/" || input === "i") {
				setFocusedPanel("search");
				setIsSearchInputFocused(true);
				return;
			}

			// Navigation in focused panel
			if (focusedPanel === "seeds") {
				const maxIndex = flatSeeds.length - 1;

				if (input === "j" || key.downArrow) {
					setSeedSelectedIndex((prev) => Math.min(prev + 1, maxIndex));
					return;
				}
				if (input === "k" || key.upArrow) {
					setSeedSelectedIndex((prev) => Math.max(prev - 1, 0));
					return;
				}
				if (input === "g") {
					setSeedSelectedIndex(0);
					return;
				}
				if (input === "G") {
					setSeedSelectedIndex(Math.max(0, maxIndex));
					return;
				}

				// Delete seed with x or d
				if ((input === "x" || input === "d") && flatSeeds.length > 0) {
					handleDeleteSeed();
					return;
				}

				// l or right arrow to switch to search
				if (input === "l" || key.rightArrow) {
					setFocusedPanel("search");
					return;
				}
			} else {
				// Search panel navigation
				const maxIndex = flatSearchResults.length - 1;

				if (input === "j" || key.downArrow) {
					setSearchSelectedIndex((prev) => Math.min(prev + 1, maxIndex));
					return;
				}
				if (input === "k" || key.upArrow) {
					setSearchSelectedIndex((prev) => Math.max(prev - 1, 0));
					return;
				}
				if (input === "g") {
					setSearchSelectedIndex(0);
					return;
				}
				if (input === "G") {
					setSearchSelectedIndex(Math.max(0, maxIndex));
					return;
				}

				// Enter to add seed
				if (key.return && flatSearchResults.length > 0) {
					handleAddSeed();
					return;
				}

				// h or left arrow to switch to seeds
				if (input === "h" || key.leftArrow) {
					setFocusedPanel("seeds");
					return;
				}
			}
		},
		{ isActive: isVisible },
	);

	if (!isVisible) {
		return null;
	}

	const truncate = (text: string, maxLen: number): string =>
		text.length > maxLen ? `${text.slice(0, maxLen - 1)}…` : text;

	// Calculate global indices for seed selection
	const getSeedGlobalIndex = (
		type: "artist" | "song",
		localIndex: number,
	): number => {
		if (type === "artist") return localIndex;
		return groupedSeeds.artists.length + localIndex;
	};

	// Calculate global indices for search selection
	const getSearchGlobalIndex = (
		type: "artist" | "song",
		localIndex: number,
	): number => {
		if (type === "artist") return localIndex;
		return groupedSearchResults.artists.length + localIndex;
	};

	const renderSeedsPanel = () => (
		<Box flexDirection="column" width="50%">
			<Text
				color={
					focusedPanel === "seeds"
						? theme.colors.accent
						: theme.colors.textMuted
				}
				bold
			>
				Current Seeds
			</Text>
			<Box flexDirection="column" marginTop={1}>
				{/* Loading state */}
				{loadingState.status === "loading" && (
					<Box>
						<Spinner label="Loading seeds..." />
					</Box>
				)}

				{/* Error state */}
				{loadingState.status === "error" && (
					<Text color={theme.colors.error}>{loadingState.message}</Text>
				)}

				{/* Empty state */}
				{loadingState.status === "success" &&
					loadingState.items.length === 0 && (
						<Text color={theme.colors.textMuted}>
							No seeds yet. Add some to customize this station.
						</Text>
					)}

				{/* Success state with items */}
				{loadingState.status === "success" && loadingState.items.length > 0 && (
					<>
						{/* Artists section */}
						{groupedSeeds.artists.length > 0 && (
							<Box flexDirection="column" marginBottom={1}>
								<Text color={theme.colors.secondary} bold>
									Artists
								</Text>
								{groupedSeeds.artists.map((item, idx) => {
									const globalIdx = getSeedGlobalIndex("artist", idx);
									const isSelected =
										focusedPanel === "seeds" && globalIdx === seedSelectedIndex;
									return (
										<Box key={item.data.seedId}>
											<Text
												color={
													isSelected
														? theme.colors.accent
														: theme.colors.textMuted
												}
											>
												{isSelected ? "> " : "  "}
											</Text>
											<Text
												color={
													isSelected
														? theme.colors.text
														: theme.colors.secondary
												}
												bold={isSelected}
											>
												{truncate(item.data.artistName ?? "", 30)}
											</Text>
										</Box>
									);
								})}
							</Box>
						)}

						{/* Songs section */}
						{groupedSeeds.songs.length > 0 && (
							<Box flexDirection="column">
								<Text color={theme.colors.secondary} bold>
									Songs
								</Text>
								{groupedSeeds.songs.map((item, idx) => {
									const globalIdx = getSeedGlobalIndex("song", idx);
									const isSelected =
										focusedPanel === "seeds" && globalIdx === seedSelectedIndex;
									return (
										<Box key={item.data.seedId}>
											<Text
												color={
													isSelected
														? theme.colors.accent
														: theme.colors.textMuted
												}
											>
												{isSelected ? "> " : "  "}
											</Text>
											<Text
												color={
													isSelected
														? theme.colors.text
														: theme.colors.secondary
												}
												bold={isSelected}
											>
												"{truncate(item.data.songName ?? "", 25)}"
											</Text>
											{item.data.artistName && (
												<Text color={theme.colors.textMuted}>
													{" by "}
													{truncate(item.data.artistName, 20)}
												</Text>
											)}
										</Box>
									);
								})}
							</Box>
						)}
					</>
				)}
			</Box>
		</Box>
	);

	const renderSearchPanel = () => (
		<Box flexDirection="column" flexGrow={1}>
			<Text
				color={
					focusedPanel === "search"
						? theme.colors.accent
						: theme.colors.textMuted
				}
				bold
			>
				Add Seed
			</Text>
			<Box marginTop={1} marginBottom={1}>
				<Text color={theme.colors.textMuted}>/ </Text>
				<TextInput
					defaultValue=""
					onChange={handleSearchQueryChange}
					placeholder="Search artists or songs..."
					isDisabled={!isSearchInputFocused}
				/>
			</Box>

			{/* Loading state */}
			{searchState.status === "loading" && (
				<Box>
					<Spinner label="Searching..." />
				</Box>
			)}

			{/* Error state */}
			{searchState.status === "error" && (
				<Text color={theme.colors.error}>{searchState.message}</Text>
			)}

			{/* Idle state */}
			{searchState.status === "idle" && searchQuery.trim() === "" && (
				<Text color={theme.colors.textMuted}>
					Type to search for artists or songs
				</Text>
			)}

			{/* Success state with no results */}
			{searchState.status === "success" && flatSearchResults.length === 0 && (
				<Text color={theme.colors.textMuted}>No results found</Text>
			)}

			{/* Success state with results */}
			{searchState.status === "success" && flatSearchResults.length > 0 && (
				<Box flexDirection="column">
					{/* Artists section */}
					{groupedSearchResults.artists.length > 0 && (
						<Box flexDirection="column" marginBottom={1}>
							<Text color={theme.colors.secondary} bold>
								Artists
							</Text>
							{groupedSearchResults.artists.map((result, idx) => {
								const globalIdx = getSearchGlobalIndex("artist", idx);
								const isSelected =
									focusedPanel === "search" &&
									!isSearchInputFocused &&
									globalIdx === searchSelectedIndex;
								return (
									<Box key={result.musicToken}>
										<Text
											color={
												isSelected
													? theme.colors.accent
													: theme.colors.textMuted
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
											{truncate(result.name, 30)}
										</Text>
									</Box>
								);
							})}
						</Box>
					)}

					{/* Songs section */}
					{groupedSearchResults.songs.length > 0 && (
						<Box flexDirection="column">
							<Text color={theme.colors.secondary} bold>
								Songs
							</Text>
							{groupedSearchResults.songs.map((result, idx) => {
								const globalIdx = getSearchGlobalIndex("song", idx);
								const isSelected =
									focusedPanel === "search" &&
									!isSearchInputFocused &&
									globalIdx === searchSelectedIndex;
								return (
									<Box key={result.musicToken}>
										<Text
											color={
												isSelected
													? theme.colors.accent
													: theme.colors.textMuted
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
											"{truncate(result.name, 25)}"
										</Text>
										{result.artist && (
											<Text color={theme.colors.textMuted}>
												{" by "}
												{truncate(result.artist, 20)}
											</Text>
										)}
									</Box>
								);
							})}
						</Box>
					)}
				</Box>
			)}
		</Box>
	);

	return (
		<Box flexDirection="column" flexGrow={1} marginX={1}>
			<Panel
				title={stationName ? `Seeds - ${stationName}` : "Seeds"}
				flexGrow={1}
			>
				<Box flexDirection="row" gap={2}>
					{renderSeedsPanel()}
					{renderSearchPanel()}
				</Box>
			</Panel>
		</Box>
	);
};

export type { SeedManagerViewProps };
