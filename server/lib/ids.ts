import type { SourceType } from "../../src/sources/types.js";

/**
 * Encode a source + id pair into an opaque base64 string.
 * Format: btoa("source:id")
 */
export function encodeId(source: SourceType, id: string): string {
	return btoa(`${source}:${id}`);
}

/**
 * Decode an opaque base64 ID back to source + id.
 * Throws if the ID is malformed.
 */
export function decodeId(opaqueId: string): {
	readonly source: SourceType;
	readonly id: string;
} {
	const decoded = atob(opaqueId);
	const idx = decoded.indexOf(":");
	if (idx === -1) {
		throw new Error(`Invalid opaque ID: missing separator`);
	}
	return {
		source: decoded.slice(0, idx) as SourceType,
		id: decoded.slice(idx + 1),
	};
}

/**
 * Build a stream URL from an opaque track ID, with optional next-track prefetch hint.
 */
export function buildStreamUrl(opaqueTrackId: string, nextOpaqueId?: string): string {
	const base = `/stream/${encodeURIComponent(opaqueTrackId)}`;
	if (!nextOpaqueId) return base;
	return `${base}?next=${encodeURIComponent(nextOpaqueId)}`;
}
