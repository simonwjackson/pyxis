/**
 * Parser functions to extract structured data from YT Music API responses.
 * Only album-related parsers are included (track/artist search uses yt-dlp).
 */

// Lightweight types for parsed results (no Zod dependency)
export type ParsedArtist = {
	readonly name: string;
	readonly id: string;
};

export type ParsedAlbum = {
	readonly name: string;
	readonly id: string;
	readonly artists?: readonly ParsedArtist[];
	readonly year: number | null;
	readonly thumbnailUrl: string | null;
};

export type ParsedTrack = {
	readonly name: string;
	readonly videoId: string;
	readonly duration: number | null;
	readonly artists?: readonly ParsedArtist[];
};

export type ParsedAlbumInfo = {
	readonly name: string;
	readonly artists: readonly ParsedArtist[];
	readonly year: number | null;
	readonly thumbnailUrl: string | null;
};

// Helper to convert duration string (mm:ss or hh:mm:ss) to seconds
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

// Extract artist from a text run
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

// Get the search results contents from API response
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

// Parse album search results
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

// Parse album tracks from browse API response (twoColumnBrowseResultsRenderer)
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

// Extract album info from browse API header
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

// Parse album info from the musicResponsiveHeaderRenderer (legacy path)
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

// Fallback: extract album info from the first track's flexColumns
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
