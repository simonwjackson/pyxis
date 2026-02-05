/**
 * @module IDs
 * Source-agnostic ID system and capability helpers.
 * Handles both library items (nanoid) and source-prefixed IDs (source:trackId).
 */

import { nanoid } from "nanoid";
import type { SourceType } from "../../src/sources/types.js";
import { getDb, schema } from "../../src/db/index.js";
import { eq } from "drizzle-orm";

// --- Capability types ---

/**
 * Features available for a track based on its source.
 * Pandora tracks have additional features (feedback, sleep, bookmark, explain).
 */
export type TrackCapabilities = {
	/** Can give thumbs up/down */
	readonly feedback: boolean;
	/** Can temporarily hide from station */
	readonly sleep: boolean;
	/** Can bookmark song/artist */
	readonly bookmark: boolean;
	/** Can explain why track was selected */
	readonly explain: boolean;
	/** Can create radio station from track */
	readonly radio: boolean;
};

/**
 * Features available for an album.
 */
export type AlbumCapabilities = {
	/** Can create radio station from album */
	readonly radio: boolean;
};

/**
 * Features available for a playlist.
 */
export type PlaylistCapabilities = {
	/** Can create radio station from playlist */
	readonly radio: boolean;
};

/**
 * Returns available capabilities for a track based on its source.
 * @param source - The track's source type
 * @returns Capability flags for the track
 */
export function trackCapabilities(source: SourceType): TrackCapabilities {
	const isPandora = source === "pandora";
	return {
		feedback: isPandora,
		sleep: isPandora,
		bookmark: isPandora,
		explain: isPandora,
		radio: true,
	};
}

/**
 * Returns available capabilities for an album.
 * @param _source - The album's source type (unused, all sources support radio)
 * @returns Capability flags for the album
 */
export function albumCapabilities(_source: SourceType): AlbumCapabilities {
	return { radio: true };
}

/**
 * Returns available capabilities for a playlist.
 * @param _source - The playlist's source type (unused, all sources support radio)
 * @returns Capability flags for the playlist
 */
export function playlistCapabilities(_source: SourceType): PlaylistCapabilities {
	return { radio: true };
}

// --- Source-agnostic ID system ---

/** Generate a short nanoid for library items */
export function generateId(): string {
	return nanoid(10);
}

/**
 * Format a source + id pair as a colon-prefixed string.
 * Used for non-library items (search results, browse, radio tracks).
 * Example: "ytmusic:OLAK5uy_nUXE..." or "pandora:abc123"
 */
export function formatSourceId(source: SourceType, id: string): string {
	return `${source}:${id}`;
}

/**
 * Parse an ID that may be either:
 * - A colon-prefixed source ID: "ytmusic:abc123" -> { source: "ytmusic", id: "abc123" }
 * - A bare nanoid: "a3kF9x2abc" -> { source: undefined, id: "a3kF9x2abc" }
 */
export function parseId(opaqueId: string): {
	readonly source: SourceType | undefined;
	readonly id: string;
} {
	const idx = opaqueId.indexOf(":");
	if (idx !== -1) {
		return {
			source: opaqueId.slice(0, idx) as SourceType,
			id: opaqueId.slice(idx + 1),
		};
	}
	// No colon — it's a nanoid (library item)
	return { source: undefined, id: opaqueId };
}

/**
 * Resolve a track ID for streaming.
 * - If colon-prefixed (source:id): return as-is (already composite format)
 * - If bare nanoid: look up albumTracks in DB to get source:sourceTrackId
 */
export async function resolveTrackForStream(opaqueId: string): Promise<string> {
	const parsed = parseId(opaqueId);
	if (parsed.source) {
		// Already a source-prefixed ID — return as composite "source:trackId"
		return `${parsed.source}:${parsed.id}`;
	}
	// Bare nanoid — look up in DB
	const db = await getDb();
	const rows = await db
		.select({
			source: schema.albumTracks.source,
			sourceTrackId: schema.albumTracks.sourceTrackId,
		})
		.from(schema.albumTracks)
		.where(eq(schema.albumTracks.id, opaqueId))
		.limit(1);
	const row = rows[0];
	if (!row) {
		throw new Error(`Unknown track ID: ${opaqueId}`);
	}
	return `${row.source}:${row.sourceTrackId}`;
}

/**
 * Resolve the source type for a track ID.
 * - If colon-prefixed: extract source directly
 * - If bare nanoid: look up in DB
 */
export async function resolveTrackSource(opaqueId: string): Promise<SourceType> {
	const parsed = parseId(opaqueId);
	if (parsed.source) {
		return parsed.source;
	}
	const db = await getDb();
	const rows = await db
		.select({ source: schema.albumTracks.source })
		.from(schema.albumTracks)
		.where(eq(schema.albumTracks.id, opaqueId))
		.limit(1);
	const row = rows[0];
	if (!row) {
		throw new Error(`Unknown track ID: ${opaqueId}`);
	}
	return row.source as SourceType;
}

/**
 * Build a stream URL from a track ID, with optional next-track prefetch hint.
 * Works with both nanoid and source:id formats (both are URL-safe).
 */
export function buildStreamUrl(opaqueTrackId: string, nextOpaqueId?: string): string {
	const base = `/stream/${encodeURIComponent(opaqueTrackId)}`;
	if (!nextOpaqueId) return base;
	return `${base}?next=${encodeURIComponent(nextOpaqueId)}`;
}
