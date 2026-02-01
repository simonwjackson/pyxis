import type { SourceType } from "../../src/sources/types.js";

// --- Capability types ---

export type TrackCapabilities = {
	readonly feedback: boolean;
	readonly sleep: boolean;
	readonly bookmark: boolean;
	readonly explain: boolean;
	readonly radio: boolean;
};

export type AlbumCapabilities = {
	readonly radio: boolean;
};

export type PlaylistCapabilities = {
	readonly radio: boolean;
};

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

export function albumCapabilities(_source: SourceType): AlbumCapabilities {
	return { radio: true };
}

export function playlistCapabilities(_source: SourceType): PlaylistCapabilities {
	return { radio: true };
}

// --- Base64URL encoding ---

function toBase64Url(str: string): string {
	return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str: string): string {
	const padded = str.replace(/-/g, "+").replace(/_/g, "/");
	return atob(padded);
}

/**
 * Encode a source + id pair into an opaque base64url string.
 * Format: base64url("source:id")
 */
export function encodeId(source: SourceType, id: string): string {
	return toBase64Url(`${source}:${id}`);
}

/**
 * Decode an opaque base64url ID back to source + id.
 * Falls back to standard base64 for backwards compatibility.
 * Throws if the ID is malformed.
 */
export function decodeId(opaqueId: string): {
	readonly source: SourceType;
	readonly id: string;
} {
	let decoded: string;
	try {
		decoded = fromBase64Url(opaqueId);
	} catch {
		// Fallback: try standard base64 for backwards compatibility
		decoded = atob(opaqueId);
	}
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
 * Base64URL is URL-safe, so no encoding needed.
 */
export function buildStreamUrl(opaqueTrackId: string, nextOpaqueId?: string): string {
	const base = `/stream/${opaqueTrackId}`;
	if (!nextOpaqueId) return base;
	return `${base}?next=${nextOpaqueId}`;
}
