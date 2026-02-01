import type { SourceManager } from "../../src/sources/index.js";
import type { SourceType } from "../../src/sources/types.js";

export type StreamRequest = {
	readonly source: SourceType;
	readonly trackId: string;
};

// Parse a composite track ID (format: "source:trackId")
export function parseTrackId(compositeId: string): StreamRequest {
	const separatorIndex = compositeId.indexOf(":");
	if (separatorIndex === -1) {
		// Default to pandora for backwards compatibility
		return { source: "pandora", trackId: compositeId };
	}
	const source = compositeId.slice(0, separatorIndex) as SourceType;
	const trackId = compositeId.slice(separatorIndex + 1);
	return { source, trackId };
}

export function encodeTrackId(source: SourceType, trackId: string): string {
	return `${source}:${trackId}`;
}

export async function resolveStreamUrl(
	sourceManager: SourceManager,
	compositeId: string,
): Promise<string> {
	const { source, trackId } = parseTrackId(compositeId);
	return sourceManager.getStreamUrl(source, trackId);
}

// Handle the stream proxy - fetches from source and pipes through
export async function handleStreamRequest(
	sourceManager: SourceManager,
	compositeId: string,
	rangeHeader: string | null,
): Promise<Response> {
	const url = await resolveStreamUrl(sourceManager, compositeId);

	// Proxy the request to the actual audio URL
	const headers: Record<string, string> = {};
	if (rangeHeader) {
		headers["Range"] = rangeHeader;
	}

	const upstream = await fetch(url, { headers });

	// Forward relevant headers
	const responseHeaders = new Headers();
	const contentType = upstream.headers.get("content-type");
	if (contentType) responseHeaders.set("Content-Type", contentType);

	const contentLength = upstream.headers.get("content-length");
	if (contentLength) responseHeaders.set("Content-Length", contentLength);

	const contentRange = upstream.headers.get("content-range");
	if (contentRange) responseHeaders.set("Content-Range", contentRange);

	const acceptRanges = upstream.headers.get("accept-ranges");
	if (acceptRanges) responseHeaders.set("Accept-Ranges", acceptRanges);
	else responseHeaders.set("Accept-Ranges", "bytes");

	responseHeaders.set("Access-Control-Allow-Origin", "*");

	return new Response(upstream.body, {
		status: upstream.status,
		headers: responseHeaders,
	});
}
