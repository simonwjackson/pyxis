/**
 * @module parsers
 * Parser functions to extract structured data from YouTube Music API responses.
 * Only album-related parsers are included (track/artist search uses yt-dlp).
 */

/**
 * Parsed artist information from YouTube Music API.
 * Contains the artist name and their YouTube Music channel ID.
 */
export type ParsedArtist = {
	/** Artist display name */
	readonly name: string;
	/** YouTube Music artist/channel ID (UC prefix + 22 characters) */
	readonly id: string;
};

/**
 * Parsed album metadata from search results.
 * Lightweight representation without full track listing.
 */
export type ParsedAlbum = {
	/** Album title */
	readonly name: string;
	/** YouTube Music album ID (MPREb_ or OLAK format) */
	readonly id: string;
	/** Artists credited on the album */
	readonly artists?: readonly ParsedArtist[];
	/** Release year if available */
	readonly year: number | null;
	/** URL to album artwork thumbnail */
	readonly thumbnailUrl: string | null;
};

/**
 * Parsed track information from album browse response.
 * Contains playback and metadata for a single track.
 */
export type ParsedTrack = {
	/** Track title */
	readonly name: string;
	/** YouTube video ID for playback */
	readonly videoId: string;
	/** Track duration in seconds */
	readonly duration: number | null;
	/** Artists credited on this specific track */
	readonly artists?: readonly ParsedArtist[];
};

/**
 * Parsed album metadata from browse response header.
 * Contains album-level information without tracks.
 */
export type ParsedAlbumInfo = {
	/** Album title */
	readonly name: string;
	/** Album artists */
	readonly artists: readonly ParsedArtist[];
	/** Release year if available */
	readonly year: number | null;
	/** URL to album artwork thumbnail */
	readonly thumbnailUrl: string | null;
};

/**
 * Converts a duration string to seconds.
 *
 * @param duration - Duration in "mm:ss" or "hh:mm:ss" format
 * @returns Duration in seconds, or null if invalid format
 *
 * @example
 * durationToSeconds("3:45") // returns 225
 * durationToSeconds("1:02:30") // returns 3750
 */
const durationToSeconds = (duration: string | undefined): number | null => {
	if (!duration || typeof duration !== "string") return null;

	const parts = duration.split(":");
	if (parts.length === 2) {
		return Number(parts[0]) * 60 + Number(parts[1]);
	}
	if (parts.length === 3) {
		return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
	}
	return null;
};

// Type for raw API responses
type RawApiResponse = Record<string, unknown>;
type FlexColumn = {
	readonly musicResponsiveListItemFlexColumnRenderer?: {
		readonly text?: { readonly runs?: ReadonlyArray<Record<string, unknown>> };
	};
};
type ListItem = {
	readonly flexColumns?: readonly FlexColumn[];
	readonly thumbnail?: {
		readonly musicThumbnailRenderer?: {
			readonly thumbnail?: {
				readonly thumbnails?: ReadonlyArray<{
					readonly url: string;
					readonly width?: number;
				}>;
			};
		};
	};
	readonly navigationEndpoint?: {
		readonly browseEndpoint?: { readonly browseId?: string };
		readonly watchEndpoint?: { readonly videoId?: string };
	};
};

/**
 * Extracts artist information from a text run element.
 *
 * @param run - Raw text run object from API response
 * @returns ParsedArtist if valid artist link found, null otherwise
 */
const extractArtist = (run: Record<string, unknown>): ParsedArtist | null => {
	const endpoint = run?.navigationEndpoint as
		| Record<string, unknown>
		| undefined;
	const browseId = (endpoint?.browseEndpoint as Record<string, unknown>)
		?.browseId as string | undefined;

	// Artist IDs start with "UC" followed by 22 characters
	if (browseId && /^UC[a-zA-Z0-9_-]{22}$/.test(browseId)) {
		return {
			name: run.text as string,
			id: browseId,
		};
	}
	return null;
};

/**
 * Extracts the search results contents array from API response.
 *
 * @param response - Raw API response object
 * @returns Array of list items from the search results shelf
 */
const getSearchContents = (response: RawApiResponse): ReadonlyArray<ListItem> => {
	const tabs = (
		response?.contents as {
			readonly tabbedSearchResultsRenderer?: {
				readonly tabs?: ReadonlyArray<{
					readonly tabRenderer?: {
						readonly content?: {
							readonly sectionListRenderer?: {
								readonly contents?: ReadonlyArray<{
									readonly musicShelfRenderer?: {
										readonly contents?: ReadonlyArray<ListItem>;
									};
								}>;
							};
						};
					};
				}>;
			};
		} | undefined
	)?.tabbedSearchResultsRenderer?.tabs;
	return (
		tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]
			?.musicShelfRenderer?.contents ?? []
	);
};

/**
 * Parses album search results from YouTube Music API response.
 * Extracts album metadata including ID, name, artists, year, and artwork.
 *
 * @param response - Raw API response from /search endpoint with album filter
 * @returns Array of parsed album objects
 *
 * @example
 * const albums = parseAlbumSearchResults(searchResponse);
 * // Returns: [{ id: "MPREb_xxx", name: "Album Title", artists: [...], year: 2024, thumbnailUrl: "..." }]
 */
export const parseAlbumSearchResults = (
	response: RawApiResponse,
): readonly ParsedAlbum[] => {
	const contents = getSearchContents(response);

	return contents
		.map((item): ParsedAlbum | null => {
			const listItem = (
				item as {
					readonly musicResponsiveListItemRenderer?: ListItem;
				}
			)?.musicResponsiveListItemRenderer;
			if (!listItem) return null;

			// Get album ID
			const albumId = listItem?.navigationEndpoint?.browseEndpoint?.browseId;
			if (!albumId) return null;

			// Get album name from first flex column
			const albumName =
				listItem?.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer
					?.text?.runs?.[0]?.text as string | undefined;
			if (!albumName) return null;

			// Get artists and year from second flex column
			const artistRuns =
				listItem?.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer
					?.text?.runs ?? [];
			const artists = (artistRuns as ReadonlyArray<Record<string, unknown>>)
				.map(extractArtist)
				.filter((a): a is ParsedArtist => a !== null);

			// Find year (4-digit number)
			const yearRun = artistRuns.find(
				(run) =>
					typeof (run as Record<string, unknown>).text === "string" &&
					/^[0-9]{4}$/.test((run as Record<string, unknown>).text as string),
			) as Record<string, unknown> | undefined;
			const year = yearRun ? parseInt(yearRun.text as string, 10) : null;

			// Get thumbnail (prefer largest)
			const thumbnails =
				listItem?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ??
				[];
			const thumbnailUrl =
				thumbnails.length > 0
					? [...thumbnails].reduce((max, curr) =>
							(curr.width ?? 0) > (max.width ?? 0) ? curr : max,
						).url
					: null;

			return {
				name: albumName,
				id: albumId,
				...(artists.length > 0 ? { artists } : {}),
				year,
				thumbnailUrl,
			};
		})
		.filter((album): album is ParsedAlbum => album !== null);
};

/**
 * Parses album tracks from browse API response.
 * Extracts track listing with video IDs, titles, durations, and artists.
 *
 * @param response - Raw API response from /browse endpoint for an album
 * @returns Array of parsed track objects with playback information
 *
 * @example
 * const tracks = parseAlbumBrowseTracks(browseResponse);
 * // Returns: [{ name: "Track 1", videoId: "abc123", duration: 180, artists: [...] }]
 */
export const parseAlbumBrowseTracks = (
	response: RawApiResponse,
): readonly ParsedTrack[] => {
	const contents = response?.contents as Record<string, unknown> | undefined;
	const twoColumn = contents?.twoColumnBrowseResultsRenderer as
		| {
				readonly secondaryContents?: {
					readonly sectionListRenderer?: {
						readonly contents?: ReadonlyArray<{
							readonly musicShelfRenderer?: {
								readonly contents?: ReadonlyArray<{
									readonly musicResponsiveListItemRenderer?: Record<
										string,
										unknown
									>;
								}>;
							};
							readonly musicPlaylistShelfRenderer?: {
								readonly contents?: ReadonlyArray<{
									readonly musicResponsiveListItemRenderer?: Record<
										string,
										unknown
									>;
								}>;
							};
						}>;
					};
				};
		  }
		| undefined;

	const firstSection =
		twoColumn?.secondaryContents?.sectionListRenderer?.contents?.[0];
	const shelf =
		firstSection?.musicShelfRenderer ??
		firstSection?.musicPlaylistShelfRenderer;
	const shelfContents = shelf?.contents;

	if (!shelfContents) return [];

	return shelfContents
		.map((item): ParsedTrack | null => {
			const listItem = item?.musicResponsiveListItemRenderer;
			if (!listItem) return null;

			// Get video ID from playlistItemData
			const playlistItemData = listItem.playlistItemData as
				| { readonly videoId?: string }
				| undefined;
			const videoId = playlistItemData?.videoId;
			if (!videoId) return null;

			// Get title from first flex column
			const flexColumns = listItem.flexColumns as
				| readonly FlexColumn[]
				| undefined;
			const titleRuns =
				flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
			const title = titleRuns?.[0]?.text as string | undefined;
			if (!title) return null;

			// Get duration from fixed columns
			const fixedColumns = listItem.fixedColumns as
				| ReadonlyArray<{
						readonly musicResponsiveListItemFixedColumnRenderer?: {
							readonly text?: {
								readonly runs?: ReadonlyArray<{ readonly text: string }>;
							};
						};
				  }>
				| undefined;
			const durationText =
				fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text
					?.runs?.[0]?.text;
			const duration = durationToSeconds(durationText);

			// Get artists from second flex column
			const artistRuns =
				flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
			const artists = artistRuns
				? (artistRuns as ReadonlyArray<Record<string, unknown>>)
						.filter((run) => {
							const browseId = (
								(run?.navigationEndpoint as Record<string, unknown>)
									?.browseEndpoint as Record<string, unknown>
							)?.browseId as string | undefined;
							return browseId && browseId.startsWith("UC");
						})
						.map((run): ParsedArtist => ({
							name: run.text as string,
							id: (
								(run?.navigationEndpoint as Record<string, unknown>)
									?.browseEndpoint as Record<string, unknown>
							)?.browseId as string,
						}))
				: [];

			return {
				name: title,
				videoId,
				duration,
				...(artists.length > 0 ? { artists } : {}),
			};
		})
		.filter((track): track is ParsedTrack => track !== null);
};

/**
 * Extracts album metadata from browse API response header.
 * Parses title, artists, year, and thumbnail from the header renderer.
 *
 * @param response - Raw API response from /browse endpoint for an album
 * @returns Album metadata object (falls back to track-based extraction if header missing)
 *
 * @example
 * const info = parseAlbumBrowseInfo(browseResponse);
 * // Returns: { name: "Album Title", artists: [...], year: 2024, thumbnailUrl: "..." }
 */
export const parseAlbumBrowseInfo = (
	response: RawApiResponse,
): ParsedAlbumInfo => {
	// Get from tabs header
	const contents = response?.contents as Record<string, unknown> | undefined;
	const twoColumn = contents?.twoColumnBrowseResultsRenderer as
		| {
				readonly tabs?: ReadonlyArray<{
					readonly tabRenderer?: {
						readonly content?: {
							readonly sectionListRenderer?: {
								readonly contents?: ReadonlyArray<{
									readonly musicResponsiveHeaderRenderer?: Record<
										string,
										unknown
									>;
								}>;
							};
						};
					};
				}>;
				readonly secondaryContents?: {
					readonly sectionListRenderer?: {
						readonly contents?: ReadonlyArray<Record<string, unknown>>;
					};
				};
		  }
		| undefined;

	const headerRenderer =
		twoColumn?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer
			?.contents?.[0]?.musicResponsiveHeaderRenderer;

	if (headerRenderer) {
		return parseFromHeaderRenderer(headerRenderer);
	}

	// Fallback: extract album info from the first track's flexColumns
	// (YouTube Music removed the header renderer from VL* playlist browse responses)
	return parseFromTrackFallback(twoColumn);
};

/**
 * Parses album info from the musicResponsiveHeaderRenderer.
 * Used for standard album browse responses with header metadata.
 *
 * @param headerRenderer - Header renderer object from browse response
 * @returns Parsed album metadata
 */
const parseFromHeaderRenderer = (
	headerRenderer: Record<string, unknown>,
): ParsedAlbumInfo => {
	// Album title
	const titleRuns = (
		headerRenderer?.title as {
			readonly runs?: ReadonlyArray<{ readonly text: string }>;
		}
	)?.runs;
	const name = titleRuns?.[0]?.text ?? "Unknown Album";

	// Artist info from straplineTextOne
	const straplineRuns = (
		headerRenderer?.straplineTextOne as {
			readonly runs?: ReadonlyArray<Record<string, unknown>>;
		}
	)?.runs;
	const artists = straplineRuns
		? ([...straplineRuns] as Array<Record<string, unknown>>)
				.filter((run) => {
					const browseId = (
						(run?.navigationEndpoint as Record<string, unknown>)
							?.browseEndpoint as Record<string, unknown>
					)?.browseId as string | undefined;
					return browseId && browseId.startsWith("UC");
				})
				.map((run): ParsedArtist => ({
					name: run.text as string,
					id: (
						(run?.navigationEndpoint as Record<string, unknown>)
							?.browseEndpoint as Record<string, unknown>
					)?.browseId as string,
				}))
		: [];

	// Year from subtitle
	const subtitleRuns = (
		headerRenderer?.subtitle as {
			readonly runs?: ReadonlyArray<{ readonly text: string }>;
		}
	)?.runs;
	const yearRun = subtitleRuns?.find((run) => /^\d{4}$/.test(run.text));
	const year = yearRun ? parseInt(yearRun.text, 10) : null;

	// Thumbnail
	const thumbnailCropped = (
		headerRenderer?.thumbnail as {
			readonly musicThumbnailRenderer?: {
				readonly thumbnail?: {
					readonly thumbnails?: ReadonlyArray<{ readonly url: string }>;
				};
			};
		}
	)?.musicThumbnailRenderer?.thumbnail?.thumbnails;
	const lastThumbnail =
		thumbnailCropped && thumbnailCropped.length > 0
			? thumbnailCropped[thumbnailCropped.length - 1]
			: undefined;
	const thumbnailUrl = lastThumbnail?.url ?? null;

	return { name, artists, year, thumbnailUrl };
};

/**
 * Fallback parser for album info when header renderer is not available.
 * Extracts metadata from the first track's flex columns instead.
 *
 * @param twoColumn - Two column browse results renderer object
 * @returns Parsed album metadata with best-effort extraction
 */
const parseFromTrackFallback = (
	twoColumn:
		| {
				readonly secondaryContents?: {
					readonly sectionListRenderer?: {
						readonly contents?: ReadonlyArray<Record<string, unknown>>;
					};
				};
		  }
		| undefined,
): ParsedAlbumInfo => {
	const firstSection =
		twoColumn?.secondaryContents?.sectionListRenderer?.contents?.[0] as
			| Record<string, unknown>
			| undefined;
	const shelf = (firstSection?.musicShelfRenderer ??
		firstSection?.musicPlaylistShelfRenderer) as
		| {
				readonly contents?: ReadonlyArray<{
					readonly musicResponsiveListItemRenderer?: Record<string, unknown>;
				}>;
		  }
		| undefined;
	const firstTrack =
		shelf?.contents?.[0]?.musicResponsiveListItemRenderer;

	if (!firstTrack) {
		return { name: "Unknown Album", artists: [], year: null, thumbnailUrl: null };
	}

	const flexColumns = firstTrack.flexColumns as
		| readonly FlexColumn[]
		| undefined;

	// flexColumns[1] = artist name + UC* browseId
	const artistRuns =
		flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
	const artists = artistRuns
		? (artistRuns as ReadonlyArray<Record<string, unknown>>)
				.map(extractArtist)
				.filter((a): a is ParsedArtist => a !== null)
		: [];

	// flexColumns[2] = album title
	const albumNameRun =
		flexColumns?.[2]?.musicResponsiveListItemFlexColumnRenderer?.text
			?.runs?.[0];
	const name = (albumNameRun?.text as string | undefined) ?? "Unknown Album";

	// Thumbnail from the first track
	const thumbnailRenderer = (
		firstTrack.thumbnail as {
			readonly musicThumbnailRenderer?: {
				readonly thumbnail?: {
					readonly thumbnails?: ReadonlyArray<{ readonly url: string }>;
				};
			};
		}
	)?.musicThumbnailRenderer?.thumbnail?.thumbnails;
	const lastThumbnail =
		thumbnailRenderer && thumbnailRenderer.length > 0
			? thumbnailRenderer[thumbnailRenderer.length - 1]
			: undefined;
	const thumbnailUrl = lastThumbnail?.url ?? null;

	return { name, artists, year: null, thumbnailUrl };
};
