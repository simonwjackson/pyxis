/**
 * @module radioReactivityTags
 *
 * Typed reactivity tags shared by the stations and station-detail surfaces.
 * Effect atoms attach these as `reactivityKeys`; mutations publish the same
 * tags so dependent query atoms refresh in step with their legacy React
 * Query invalidation behavior.
 *
 * Centralized so the page query atom and the per-dialog command atoms agree
 * on the exact tag string and a future station-detail atom (next U6 slice)
 * can subscribe to the per-station tag without reaching into this module's
 * implementation details.
 */

/** Refresh tag for the `radio.stations.list` query (formerly `radio.list`). */
export const RADIO_STATIONS_TAG = "radio.stations" as const;

/**
 * Refresh tag for a single station detail read (`radio.station.get`). The
 * `id` is the same opaque station identifier passed to `radio.station.get`.
 */
export function radioStationTag(id: string): string {
	return `radio.station:${id}`;
}
