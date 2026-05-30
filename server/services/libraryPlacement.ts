/**
 * @module libraryPlacement
 * Central placement semantics for album library state.
 */

import type { AlbumPlacement } from "@shared/db/config.js";

export const LIBRARY_PLACEMENTS = [
  "discovery",
  "collection",
  "archive",
] as const satisfies readonly AlbumPlacement[];

export const DEFAULT_VISIBLE_LIBRARY_PLACEMENTS = [
  "discovery",
  "collection",
] as const satisfies readonly AlbumPlacement[];

export const ALL_ALBUM_PLACEMENTS = [
  "discovery",
  "collection",
  "archive",
  "dismissed",
] as const satisfies readonly AlbumPlacement[];

export function isLibraryPlacement(placement: AlbumPlacement): boolean {
  return placement !== "dismissed";
}

export function createInitialPlacement(now: number): {
  readonly placement: AlbumPlacement;
  readonly placementUpdatedAt: number;
} {
  return {
    placement: "discovery",
    placementUpdatedAt: now,
  };
}

export function restorePlacement(now: number): {
  readonly placement: AlbumPlacement;
  readonly placementUpdatedAt: number;
} {
  return {
    placement: "discovery",
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

export function resolveListPlacements(options?: {
  readonly placements?: readonly AlbumPlacement[] | undefined;
  readonly includeArchive?: boolean | undefined;
  readonly includeDismissed?: boolean | undefined;
}): readonly AlbumPlacement[] {
  if (options?.placements && options.placements.length > 0) {
    return options.placements;
  }

  const placements: AlbumPlacement[] = [...DEFAULT_VISIBLE_LIBRARY_PLACEMENTS];
  if (options?.includeArchive) {
    placements.push("archive");
  }
  if (options?.includeDismissed) {
    placements.push("dismissed");
  }
  return placements;
}
