/**
 * @module albumRelationshipPolicy
 * Single policy seam for album placement relationships and Hot read-model
 * computation. This file owns Discovery/Collection/Archive/Dismissed visibility,
 * restore-from-dismissed behavior, and configurable recent-listen heuristics.
 */

import type { AlbumPlacement, AlbumTrack, ListenLog } from "@shared/db/config.js";
import type { DbInstance } from "@shared/db/index.js";
import type { AppConfig } from "@shared/config.js";
import type { SourceType } from "@shared/sources/types.js";
import { formatSourceId, parseId } from "../lib/ids.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_HOT_WINDOW_DAYS = 30;
const DEFAULT_HOT_MIN_RECENT_LISTENS = 3;

const DEFAULT_VISIBLE_LIBRARY_PLACEMENTS = [
  "discovery",
  "collection",
] as const satisfies readonly AlbumPlacement[];

export type AlbumRelationshipPolicy = {
  readonly placement: {
    readonly initial: AlbumPlacement;
    readonly restoreFromDismissed: AlbumPlacement;
    readonly defaultVisible: readonly AlbumPlacement[];
  };
  readonly hot: {
    readonly windowMs: number;
    readonly minRecentListens: number;
  };
  /**
   * Explicit extension point for future product policy without changing the
   * placement semantics above: Weekly Mix, cache retention, neglect detection,
   * and settings UI can attach here later.
   */
  readonly future: {
    readonly supportsWeeklyMix: true;
    readonly supportsCacheRetention: true;
    readonly supportsNeglectDetection: true;
  };
};

export type HotAlbumState = {
  readonly albumId: string;
  readonly isHot: boolean;
  readonly hotRank: number | null;
  readonly recentListenCount: number;
  readonly lastListenedAt: number | null;
};

export type AlbumRelationshipListOptions = {
  readonly placements?: readonly AlbumPlacement[] | undefined;
  readonly includeArchive?: boolean | undefined;
  readonly includeDismissed?: boolean | undefined;
};

export type AlbumRelationshipReadOptions = {
  readonly now?: number | undefined;
  readonly policy?: AlbumRelationshipPolicy | undefined;
};

export const DEFAULT_ALBUM_RELATIONSHIP_POLICY: AlbumRelationshipPolicy = {
  placement: {
    initial: "discovery",
    restoreFromDismissed: "discovery",
    defaultVisible: DEFAULT_VISIBLE_LIBRARY_PLACEMENTS,
  },
  hot: {
    windowMs: DEFAULT_HOT_WINDOW_DAYS * DAY_MS,
    minRecentListens: DEFAULT_HOT_MIN_RECENT_LISTENS,
  },
  future: {
    supportsWeeklyMix: true,
    supportsCacheRetention: true,
    supportsNeglectDetection: true,
  },
};

let configuredPolicy = DEFAULT_ALBUM_RELATIONSHIP_POLICY;

function albumRelationshipPolicyFromConfig(
  config: AppConfig,
): AlbumRelationshipPolicy {
  return {
    ...DEFAULT_ALBUM_RELATIONSHIP_POLICY,
    hot: {
      windowMs: config.library.albumRelationship.hot.windowDays * DAY_MS,
      minRecentListens:
        config.library.albumRelationship.hot.minRecentListens,
    },
  };
}

export function setConfiguredAlbumRelationshipPolicy(
  config: AppConfig,
): void {
  configuredPolicy = albumRelationshipPolicyFromConfig(config);
}

export function getConfiguredAlbumRelationshipPolicy(): AlbumRelationshipPolicy {
  return configuredPolicy;
}

export function resolveAlbumRelationshipPolicy(
  policy?: AlbumRelationshipPolicy | undefined,
): AlbumRelationshipPolicy {
  return policy ?? DEFAULT_ALBUM_RELATIONSHIP_POLICY;
}

export function createInitialPlacement(
  policy: AlbumRelationshipPolicy,
  now: number,
): {
  readonly placement: AlbumPlacement;
  readonly placementUpdatedAt: number;
} {
  return {
    placement: policy.placement.initial,
    placementUpdatedAt: now,
  };
}

export function restorePlacement(
  policy: AlbumRelationshipPolicy,
  now: number,
): {
  readonly placement: AlbumPlacement;
  readonly placementUpdatedAt: number;
} {
  return {
    placement: policy.placement.restoreFromDismissed,
    placementUpdatedAt: now,
  };
}

export function setPlacement(
  placement: AlbumPlacement,
  now: number,
): {
  readonly placement: AlbumPlacement;
  readonly placementUpdatedAt: number;
} {
  return {
    placement,
    placementUpdatedAt: now,
  };
}

export function resolveListPlacements(
  policy: AlbumRelationshipPolicy,
  options?: AlbumRelationshipListOptions,
): readonly AlbumPlacement[] {
  if (options?.placements && options.placements.length > 0) {
    return options.placements;
  }

  const placements: AlbumPlacement[] = [...policy.placement.defaultVisible];
  if (options?.includeArchive) {
    placements.push("archive");
  }
  if (options?.includeDismissed) {
    placements.push("dismissed");
  }
  return placements;
}

type TrackRow = AlbumTrack;

type ListenRow = ListenLog;

type ListenAggregate = {
  readonly count: number;
  readonly lastListenedAt: number;
};

type RankedHotAlbum = Omit<HotAlbumState, "hotRank">;

function indexAlbumsByTrackSourceId(tracks: readonly TrackRow[]): Map<string, string> {
  const albumByTrackSourceId = new Map<string, string>();
  for (const track of tracks) {
    albumByTrackSourceId.set(
      formatSourceId(track.source as SourceType, track.sourceTrackId),
      track.albumId,
    );
  }
  return albumByTrackSourceId;
}

function albumIdForListen(
  listen: ListenRow,
  albumByTrackSourceId: ReadonlyMap<string, string>,
): string | null {
  const parsed = parseId(listen.compositeId);
  if (!parsed.source) return null;

  return albumByTrackSourceId.get(formatSourceId(parsed.source, parsed.id)) ?? null;
}

function aggregateRecentListens(
  listens: readonly ListenRow[],
  albumByTrackSourceId: ReadonlyMap<string, string>,
  windowStart: number,
): Map<string, ListenAggregate> {
  const aggregates = new Map<string, ListenAggregate>();
  for (const listen of listens) {
    if (listen.listenedAt < windowStart) continue;

    const albumId = albumIdForListen(listen, albumByTrackSourceId);
    if (!albumId) continue;

    const existing = aggregates.get(albumId);
    aggregates.set(albumId, {
      count: (existing?.count ?? 0) + 1,
      lastListenedAt: Math.max(
        existing?.lastListenedAt ?? Number.NEGATIVE_INFINITY,
        listen.listenedAt,
      ),
    });
  }
  return aggregates;
}

function compareRankedHotAlbums(a: RankedHotAlbum, b: RankedHotAlbum): number {
  if (b.recentListenCount !== a.recentListenCount) {
    return b.recentListenCount - a.recentListenCount;
  }
  if (b.lastListenedAt !== a.lastListenedAt) {
    return (b.lastListenedAt ?? 0) - (a.lastListenedAt ?? 0);
  }
  return a.albumId.localeCompare(b.albumId);
}

function rankHotAlbums(
  aggregates: ReadonlyMap<string, ListenAggregate>,
  minRecentListens: number,
): readonly RankedHotAlbum[] {
  return [...aggregates.entries()]
    .map(([albumId, aggregate]) => ({
      albumId,
      recentListenCount: aggregate.count,
      lastListenedAt: aggregate.lastListenedAt,
      isHot: aggregate.count >= minRecentListens,
    }))
    .sort(compareRankedHotAlbums);
}

function toHotAlbumMap(
  ranked: readonly RankedHotAlbum[],
): Map<string, HotAlbumState> {
  const hotMap = new Map<string, HotAlbumState>();
  let hotRank = 0;
  for (const album of ranked) {
    if (album.isHot) hotRank += 1;
    hotMap.set(album.albumId, {
      ...album,
      hotRank: album.isHot ? hotRank : null,
    });
  }
  return hotMap;
}

export async function getHotAlbumMap(
  db: DbInstance,
  options?: AlbumRelationshipReadOptions,
): Promise<Map<string, HotAlbumState>> {
  const policy = resolveAlbumRelationshipPolicy(options?.policy);
  const now = options?.now ?? Date.now();
  const windowStart = now - policy.hot.windowMs;

  const [tracks, listens] = await Promise.all([
    db.albumTracks.query({}).runPromise,
    db.listenLog.query({ sort: { listenedAt: "desc" } }).runPromise,
  ]);

  const albumByTrackSourceId = indexAlbumsByTrackSourceId(tracks);
  const aggregates = aggregateRecentListens(
    listens,
    albumByTrackSourceId,
    windowStart,
  );
  return toHotAlbumMap(
    rankHotAlbums(aggregates, policy.hot.minRecentListens),
  );
}
