/**
 * @module hotAlbums
 * Computes album hotness from recent listen history.
 */

import { formatSourceId, parseId } from "../lib/ids.js";
import type { DbInstance } from "../../src/db/index.js";
import type { SourceType } from "../../src/sources/types.js";

export const HOT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const HOT_MIN_RECENT_LISTENS = 3;

export type HotAlbumState = {
	readonly albumId: string;
	readonly isHot: boolean;
	readonly hotRank: number | null;
	readonly recentListenCount: number;
	readonly lastListenedAt: number | null;
};

export async function getHotAlbumMap(
	db: DbInstance,
	options?: { readonly now?: number | undefined },
): Promise<Map<string, HotAlbumState>> {
	const now = options?.now ?? Date.now();
	const windowStart = now - HOT_WINDOW_MS;

	const [tracks, listens] = await Promise.all([
		db.albumTracks.query({}).runPromise,
		db.listenLog.query({ sort: { listenedAt: "desc" } }).runPromise,
	]);

	const albumByTrackSourceId = new Map<string, string>();
	for (const track of tracks) {
		albumByTrackSourceId.set(
			formatSourceId(track.source as SourceType, track.sourceTrackId),
			track.albumId,
		);
	}

	const aggregates = new Map<string, { count: number; lastListenedAt: number }>();
	for (const listen of listens) {
		if (listen.listenedAt < windowStart) {
			continue;
		}

		const parsed = parseId(listen.compositeId);
		if (!parsed.source) {
			continue;
		}

		const albumId = albumByTrackSourceId.get(
			formatSourceId(parsed.source, parsed.id),
		);
		if (!albumId) {
			continue;
		}

		const existing = aggregates.get(albumId);
		if (existing) {
			aggregates.set(albumId, {
				count: existing.count + 1,
				lastListenedAt: Math.max(existing.lastListenedAt, listen.listenedAt),
			});
		} else {
			aggregates.set(albumId, {
				count: 1,
				lastListenedAt: listen.listenedAt,
			});
		}
	}

	const ranked = [...aggregates.entries()]
		.map(([albumId, aggregate]) => ({
			albumId,
			recentListenCount: aggregate.count,
			lastListenedAt: aggregate.lastListenedAt,
			isHot: aggregate.count >= HOT_MIN_RECENT_LISTENS,
		}))
		.sort((a, b) => {
			if (b.recentListenCount !== a.recentListenCount) {
				return b.recentListenCount - a.recentListenCount;
			}
			if (b.lastListenedAt !== a.lastListenedAt) {
				return b.lastListenedAt - a.lastListenedAt;
			}
			return a.albumId.localeCompare(b.albumId);
		});

	const hotMap = new Map<string, HotAlbumState>();
	let hotRank = 0;
	for (const album of ranked) {
		if (album.isHot) {
			hotRank += 1;
		}
		hotMap.set(album.albumId, {
			albumId: album.albumId,
			isHot: album.isHot,
			hotRank: album.isHot ? hotRank : null,
			recentListenCount: album.recentListenCount,
			lastListenedAt: album.lastListenedAt,
		});
	}

	return hotMap;
}
