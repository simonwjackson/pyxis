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
import { search } from "../../../api/music.js";
import type { MusicSearchResponse } from "../../../types/api.js";
import { Panel } from "../layout/index.js";
import { useTheme } from "../../theme/index.js";

type SearchResult = {
	readonly type: "artist" | "song" | "genre";
	readonly name: string;
	readonly artist?: string;
	readonly musicToken: string;
};

type SearchViewProps = {
	readonly onSelect: (result: SearchResult) => void;
	readonly onClose: () => void;
	readonly isVisible: boolean;
	readonly authState?: {
		readonly syncTime: number;
		readonly partnerId: string;
		readonly partnerAuthToken: string;
		readonly userAuthToken: string;
		readonly userId: string;
	};
};

type SearchState =
	| { readonly status: "idle" }
	| { readonly status: "loading" }
	| { readonly status: "success"; readonly results: readonly SearchResult[] }
	| { readonly status: "error"; readonly message: string };

const DEBOUNCE_MS = 300;

/**
 * SearchView component for searching artists, songs, and genres.
 *
 * Layout:
 * ```
 * ╭─ Search ────────────────────────────────────────────────────────────────╮
 * │  / pink floyd                                                           │
 * ╰─────────────────────────────────────────────────────────────────────────╯
 *
 * ╭─ Results ───────────────────────────────────────────────────────────────╮
 * │                                                                         │
 * │  Artists                                                                │
 * │  > Pink Floyd                                                           │
 * │    Pink Floyd Experience (Tribute)                                      │
 * │                                                                         │
 * │  Songs                                                                  │
 * │    Comfortably Numb - Pink Floyd                                        │
 * │    Wish You Were Here - Pink Floyd                                      │
 * │                                                                         │
 * │  Genres                                                                 │
 * │    Psychedelic Rock                                                     │
 * │    Progressive Rock                                                     │
 * │                                                                         │
 * ╰─────────────────────────────────────────────────────────────────────────╯
 * ```
 *
 * Features:
 * - Debounced search (300ms)
 * - Keyboard navigation (j/k)
 * - Enter to select, Esc to close
 * - Loading spinner during search
 * - Grouped results by type
 */
export const SearchView: FC<SearchViewProps> = ({
	onSelect,
	onClose,
	isVisible,
	authState,
}) => {
	const theme = useTheme();
	const [query, setQuery] = useState("");
	const [searchState, setSearchState] = useState<SearchState>({
		status: "idle",
	});
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [isInputFocused, setIsInputFocused] = useState(true);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Flatten results for navigation
	const flatResults = useMemo(() => {
		if (searchState.status !== "success") return [];
		return searchState.results;
	}, [searchState]);

	// Group results by type for display
	const groupedResults = useMemo(() => {
		if (searchState.status !== "success")
			return { artists: [], songs: [], genres: [] };

		const artists: SearchResult[] = [];
		const songs: SearchResult[] = [];
		const genres: SearchResult[] = [];

		for (const result of searchState.results) {
			switch (result.type) {
				case "artist":
					artists.push(result);
					break;
				case "song":
					songs.push(result);
					break;
				case "genre":
					genres.push(result);
					break;
			}
		}

		return { artists, songs, genres };
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

			// Add genres
			if (response.genreStations) {
				for (const genre of response.genreStations) {
					results.push({
						type: "genre",
						name: genre.stationName,
						musicToken: genre.musicToken,
					});
				}
			}

			return results;
		},
		[],
	);

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
				setSelectedIndex(0);
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

		if (!query.trim()) {
			setSearchState({ status: "idle" });
			return;
		}

		debounceRef.current = setTimeout(() => {
			performSearch(query);
		}, DEBOUNCE_MS);

		return () => {
			if (debounceRef.current) {
				clearTimeout(debounceRef.current);
			}
		};
	}, [query, performSearch]);

	// Reset state when visibility changes
	useEffect(() => {
		if (isVisible) {
			setQuery("");
			setSearchState({ status: "idle" });
			setSelectedIndex(0);
			setIsInputFocused(true);
		}
	}, [isVisible]);

	// Handle query changes from TextInput
	const handleQueryChange = useCallback((value: string) => {
		setQuery(value);
	}, []);

	// Handle keyboard input for navigation
	useInput(
		(input, key) => {
			// Esc to close
			if (key.escape) {
				onClose();
				return;
			}

			// When input is focused, Tab or down arrow exits input mode
			if (isInputFocused) {
				if (key.tab || (key.downArrow && flatResults.length > 0)) {
					setIsInputFocused(false);
					return;
				}
				// Let TextInput handle other keys
				return;
			}

			// Navigation mode
			if (input === "j" || key.downArrow) {
				setSelectedIndex((prev) => Math.min(prev + 1, flatResults.length - 1));
				return;
			}
			if (input === "k" || key.upArrow) {
				setSelectedIndex((prev) => Math.max(prev - 1, 0));
				return;
			}

			// Enter to select
			if (key.return && flatResults.length > 0) {
				const selected = flatResults[selectedIndex];
				if (selected) {
					onSelect(selected);
				}
				return;
			}

			// / to refocus input
			if (input === "/" || input === "i") {
				setIsInputFocused(true);
				return;
			}
		},
		{ isActive: isVisible },
	);

	if (!isVisible) return null;

	const renderResultItem = (result: SearchResult, isSelected: boolean) => {
		const prefix = isSelected ? ">" : " ";
		const prefixColor = isSelected
			? theme.colors.accent
			: theme.colors.textMuted;

		if (result.type === "song") {
			return (
				<Box key={result.musicToken}>
					<Text color={prefixColor}>{prefix} </Text>
					<Text
						color={isSelected ? theme.colors.text : theme.colors.secondary}
						bold={isSelected}
					>
						{result.name}
					</Text>
					<Text color={theme.colors.textMuted}> - {result.artist}</Text>
				</Box>
			);
		}

		return (
			<Box key={result.musicToken}>
				<Text color={prefixColor}>{prefix} </Text>
				<Text
					color={isSelected ? theme.colors.text : theme.colors.secondary}
					bold={isSelected}
				>
					{result.name}
				</Text>
			</Box>
		);
	};

	const renderResultGroup = (
		title: string,
		results: readonly SearchResult[],
		startIndex: number,
	) => {
		if (results.length === 0) return null;

		return (
			<Box flexDirection="column" marginBottom={1} key={title}>
				<Text color={theme.colors.accent} bold>
					{title}
				</Text>
				{results.map((result, idx) => {
					const globalIndex = startIndex + idx;
					const isSelected = !isInputFocused && globalIndex === selectedIndex;
					return renderResultItem(result, isSelected);
				})}
			</Box>
		);
	};

	// Calculate start indices for each group
	const artistsStartIndex = 0;
	const songsStartIndex = groupedResults.artists.length;
	const genresStartIndex = songsStartIndex + groupedResults.songs.length;

	return (
		<Box flexDirection="column" flexGrow={1} marginX={1}>
			{/* Search input panel */}
			<Panel title="Search">
				<Box>
					<Text color={theme.colors.textMuted}>/ </Text>
					<TextInput
						defaultValue=""
						onChange={handleQueryChange}
						placeholder="Search artists, songs, genres..."
						isDisabled={!isInputFocused}
					/>
				</Box>
			</Panel>

			{/* Results panel */}
			<Panel title="Results" flexGrow={1}>
				<Box flexDirection="column">
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
					{searchState.status === "idle" && query.trim() === "" && (
						<Text color={theme.colors.textMuted}>
							Type to search for artists, songs, or genres
						</Text>
					)}

					{/* Success state with no results */}
					{searchState.status === "success" && flatResults.length === 0 && (
						<Text color={theme.colors.textMuted}>No results found</Text>
					)}

					{/* Success state with results */}
					{searchState.status === "success" && flatResults.length > 0 && (
						<Box flexDirection="column">
							{renderResultGroup(
								"Artists",
								groupedResults.artists,
								artistsStartIndex,
							)}
							{renderResultGroup(
								"Songs",
								groupedResults.songs,
								songsStartIndex,
							)}
							{renderResultGroup(
								"Genres",
								groupedResults.genres,
								genresStartIndex,
							)}
						</Box>
					)}
				</Box>
			</Panel>
		</Box>
	);
};

export type { SearchResult, SearchViewProps };
