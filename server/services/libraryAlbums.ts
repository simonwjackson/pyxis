/**
 * @module libraryAlbums
 * Placement-aware library album service.
 */

import { Effect } from "effect";
import { formatSourceId, generateId, parseId } from "../lib/ids.js";
import type { DbInstance } from "../../src/db/index.js";
import type { AlbumPlacement } from "../../src/db/config.js";
import type { SourceType } from "../../src/sources/types.js";
import type { SourceManager } from "../../src/sources/index.js";
import { getHotAlbumMap, type HotAlbumState } from "./hotAlbums.js";
import {
	createInitialPlacement,
	resolveListPlacements,
	restorePlacement,
	setPlacement as buildPlacementUpdate,
} from "./libraryPlacement.js";

export type LibraryAlbumView = {
	readonly id: string;
	readonly title: string;
	readonly artist: string;
	readonly year?: number;
	readonly artworkUrl?: string;
	readonly placement: AlbumPlacement;
	readonly placementUpdatedAt: number;
	readonly sourceIds: readonly string[];
	readonly isHot: boolean;
	readonly hotRank: number | null;
	readonly recentListenCount: number;
	readonly lastListenedAt: number | null;
};

export type ResolvedAlbumState = {
	readonly sourceId: string;
	readonly albumId: string;
	readonly placement: AlbumPlacement;
	readonly isHot: boolean;
	readonly hotRank: number | null;
	readonly recentListenCount: number;
};

type AlbumRecord = {
	readonly id: string;
	readonly title: string;
	readonly artist: string;
	readonly year?: number;
	readonly artworkUrl?: string;
	readonly placement: AlbumPlacement;
	readonly placementUpdatedAt: number;
};

type AlbumSourceRefRecord = {
	readonly id: string;
	readonly albumId: string;
	readonly source: string;
	readonly sourceId: string;
};

function withHotDefaults(albumId: string, hotMap: Map<string, HotAlbumState>): HotAlbumState {
	return hotMap.get(albumId) ?? {
		albumId,
		isHot: false,
		hotRank: null,
		recentListenCount: 0,
		lastListenedAt: null,
	};
}

async function loadAlbumsWithRefs(
	db: DbInstance,
	options?: { readonly now?: number | undefined },
): Promise<{
	readonly albums: readonly AlbumRecord[];
	readonly refsByAlbumId: Map<string, string[]>;
	readonly hotMap: Map<string, HotAlbumState>;
}> {
	const hotOptions = options?.now !== undefined ? { now: options.now } : undefined;
	const [albumsRaw, refsRaw, hotMap] = await Promise.all([
		db.albums.query({}).runPromise,
		db.albumSourceRefs.query({}).runPromise,
		getHotAlbumMap(db, hotOptions),
	]);

	const albums = albumsRaw as readonly AlbumRecord[];
	const refs = refsRaw as readonly AlbumSourceRefRecord[];
	const refsByAlbumId = new Map<string, string[]>();
	for (const ref of refs) {
		const sourceIds = refsByAlbumId.get(ref.albumId) ?? [];
		sourceIds.push(formatSourceId(ref.source as SourceType, ref.sourceId));
		refsByAlbumId.set(ref.albumId, sourceIds);
	}

	return { albums, refsByAlbumId, hotMap };
}

function toAlbumView(
	album: AlbumRecord,
	refsByAlbumId: Map<string, string[]>,
	hotMap: Map<string, HotAlbumState>,
): LibraryAlbumView {
	const hot = withHotDefaults(album.id, hotMap);
	return {
		id: album.id,
		title: album.title,
		artist: album.artist,
		...(album.year != null ? { year: album.year } : {}),
		...(album.artworkUrl != null ? { artworkUrl: album.artworkUrl } : {}),
		placement: album.placement,
		placementUpdatedAt: album.placementUpdatedAt,
		sourceIds: refsByAlbumId.get(album.id) ?? [],
		isHot: hot.isHot,
		hotRank: hot.hotRank,
		recentListenCount: hot.recentListenCount,
		lastListenedAt: hot.lastListenedAt,
	};
}

export async function listLibraryAlbums(
	db: DbInstance,
	options?: {
		readonly placements?: readonly AlbumPlacement[] | undefined;
		readonly includeArchive?: boolean | undefined;
		readonly includeDismissed?: boolean | undefined;
		readonly hotOnly?: boolean | undefined;
		readonly now?: number | undefined;
	},
): Promise<readonly LibraryAlbumView[]> {
	const placements = new Set(resolveListPlacements(options));
	const { albums, refsByAlbumId, hotMap } = await loadAlbumsWithRefs(db, options);

	return albums
		.filter((album) => placements.has(album.placement))
		.map((album) => toAlbumView(album, refsByAlbumId, hotMap))
		.filter((album) => (options?.hotOnly ? album.isHot : true))
		.sort((a, b) => {
			if (options?.hotOnly) {
				const aRank = a.hotRank ?? Number.MAX_SAFE_INTEGER;
				const bRank = b.hotRank ?? Number.MAX_SAFE_INTEGER;
				if (aRank !== bRank) return aRank - bRank;
			}
			if (b.placementUpdatedAt !== a.placementUpdatedAt) {
				return b.placementUpdatedAt - a.placementUpdatedAt;
			}
			return a.title.localeCompare(b.title);
		});
}

export async function getLibraryAlbum(
	db: DbInstance,
	albumId: string,
	options?: { readonly now?: number | undefined },
): Promise<LibraryAlbumView | null> {
	const { albums, refsByAlbumId, hotMap } = await loadAlbumsWithRefs(db, options);
	const album = albums.find((candidate) => candidate.id === albumId);
	if (!album) return null;
	return toAlbumView(album, refsByAlbumId, hotMap);
}

export async function resolveAlbumStatesForSourceIds(
	db: DbInstance,
	sourceIds: readonly string[],
	options?: { readonly now?: number | undefined },
): Promise<readonly ResolvedAlbumState[]> {
	if (sourceIds.length === 0) return [];

	const hotOptions = options?.now !== undefined ? { now: options.now } : undefined;
	const [albumsRaw, refsRaw, hotMap] = await Promise.all([
		db.albums.query({}).runPromise,
		db.albumSourceRefs.query({}).runPromise,
		getHotAlbumMap(db, hotOptions),
	]);
	const albums = albumsRaw as readonly AlbumRecord[];
	const refs = refsRaw as readonly AlbumSourceRefRecord[];
	const albumsById = new Map(albums.map((album) => [album.id, album] as const));
	const refsBySourceId = new Map(
		refs.map((ref) => [formatSourceId(ref.source as SourceType, ref.sourceId), ref] as const),
	);

	const resolved: ResolvedAlbumState[] = [];
	for (const sourceId of sourceIds) {
		const ref = refsBySourceId.get(sourceId);
		if (!ref) continue;
		const album = albumsById.get(ref.albumId);
		if (!album) continue;
		const hot = withHotDefaults(album.id, hotMap);
		resolved.push({
			sourceId,
			albumId: album.id,
			placement: album.placement,
			isHot: hot.isHot,
			hotRank: hot.hotRank,
			recentListenCount: hot.recentListenCount,
		});
	}

	return resolved;
}

export async function setAlbumPlacement(
	db: DbInstance,
	albumId: string,
	placement: AlbumPlacement,
	options?: { readonly now?: number | undefined },
): Promise<LibraryAlbumView> {
	const now = options?.now ?? Date.now();
	await db.albums.update(albumId, buildPlacementUpdate(placement, now)).runPromise;
	const updated = await getLibraryAlbum(db, albumId, { now });
	if (!updated) {
		throw new Error(`Album not found: ${albumId}`);
	}
	return updated;
}

export async function saveAlbumToLibrary(
	db: DbInstance,
	sourceManager: Pick<SourceManager, "getAlbumTracks">,
	sourceAlbumId: string,
	options?: {
		readonly now?: number | undefined;
		readonly createId?: (() => string) | undefined;
	},
): Promise<{
		readonly id: string;
		readonly outcome: "created" | "restored" | "existing";
		readonly placement: AlbumPlacement;
	}> {
	const parsed = parseId(sourceAlbumId);
	if (!parsed.source) {
		throw new Error(
			`Cannot save album: ID must be a source-prefixed ID (e.g. ytmusic:abc), got: ${sourceAlbumId}`,
		);
	}

	const now = options?.now ?? Date.now();
	const createId = options?.createId ?? generateId;
	const source = parsed.source;
	const sourceId = parsed.id;

	const existingRefs = await db.albumSourceRefs.query({
		where: { source, sourceId },
	}).runPromise;
	const existingRef = (existingRefs as readonly AlbumSourceRefRecord[])[0];
	if (existingRef) {
		const existingAlbum = await db.albums.findById(existingRef.albumId).runPromise as AlbumRecord | null;
		if (!existingAlbum) {
			throw new Error(`Album source ref points to missing album: ${existingRef.albumId}`);
		}
		if (existingAlbum.placement === "dismissed") {
			await db.albums.update(existingAlbum.id, restorePlacement(now)).runPromise;
			return {
				id: existingAlbum.id,
				outcome: "restored",
				placement: "discovery",
			};
		}
		return {
			id: existingAlbum.id,
			outcome: "existing",
			placement: existingAlbum.placement,
		};
	}

	const { album, tracks } = await sourceManager.getAlbumTracks(source, sourceId);
	const newAlbumId = createId();
	const initialPlacement = createInitialPlacement(now);

	await Effect.runPromise(
		db.$transaction((tx) =>
			Effect.gen(function* () {
				yield* tx.albums.create({
					id: newAlbumId,
					title: album.title,
					artist: album.artist,
					...(album.year != null ? { year: album.year } : {}),
					...(album.artworkUrl != null ? { artworkUrl: album.artworkUrl } : {}),
					...initialPlacement,
					createdAt: now,
				} as never);

				for (const sid of album.sourceIds) {
					yield* tx.albumSourceRefs.create({
						id: `${newAlbumId}-${sid.source}-${sid.id}`,
						albumId: newAlbumId,
						source: sid.source,
						sourceId: sid.id,
					});
				}

				for (const [index, track] of tracks.entries()) {
					yield* tx.albumTracks.create({
						id: createId(),
						albumId: newAlbumId,
						trackIndex: index,
						title: track.title,
						artist: track.artist,
						source: track.sourceId.source,
						sourceTrackId: track.sourceId.id,
						...(track.duration != null
							? { duration: Math.round(track.duration) }
							: {}),
						...(track.artworkUrl != null
							? { artworkUrl: track.artworkUrl }
							: {}),
					});
				}
			}),
		),
	);

	return {
		id: newAlbumId,
		outcome: "created",
		placement: "discovery",
	};
}
