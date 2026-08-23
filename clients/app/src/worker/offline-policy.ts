import type { OfflineMedia } from "./contract"

/// Keep this much headroom before another complete audio file is committed.
export const MIN_FREE_BYTES = 64 * 1024 * 1024
/// Above this fill fraction the origin is under storage pressure.
export const PRESSURE_FRACTION = 0.85

export interface StorageEstimateLike {
  readonly usage?: number
  readonly quota?: number
}

export function storageIsPressured(estimate: StorageEstimateLike | undefined): boolean {
  const usage = estimate?.usage
  const quota = estimate?.quota
  if (usage === undefined || quota === undefined || quota <= 0) return false
  if (quota - usage < MIN_FREE_BYTES) return true
  return usage > quota * PRESSURE_FRACTION
}

/// Unretained tracks leave least-recently-opened first. Only the explicit retained set is
/// protected; under hard quota pressure even the newest unpinned track may need to leave.
export function selectEvictionOrder(
  media: readonly OfflineMedia[],
  retain: ReadonlySet<string>,
): readonly string[] {
  const opened = (entry: OfflineMedia): number => entry.openedAt ?? entry.cachedAt
  return media
    .filter((entry) => !retain.has(entry.trackId))
    .sort((left, right) => opened(left) - opened(right))
    .map((entry) => entry.trackId)
}
