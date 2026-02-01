import type { SourceManager } from "../../src/sources/index.js";
import type { SourceType } from "../../src/sources/types.js";
import { createLogger } from "../../src/logger.js";

const streamLogger = createLogger("stream");

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
	const startTime = Date.now();
	streamLogger.log(`[stream] request compositeId=${compositeId} range=${rangeHeader ?? "none"}`);

	let url: string;
	try {
		url = await resolveStreamUrl(sourceManager, compositeId);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		streamLogger.error(`[stream] resolve failed compositeId=${compositeId}: ${message}`);
		throw err;
	}

	// Log redacted URL (show host only)
	try {
		const parsedUrl = new URL(url);
		streamLogger.log(`[stream] upstream host=${parsedUrl.host} path=${parsedUrl.pathname.slice(0, 40)}...`);
	} catch {
		streamLogger.log("[stream] upstream url=(non-parseable)");
	}

	// Proxy the request to the actual audio URL
	const headers: Record<string, string> = {};
	if (rangeHeader) {
		headers["Range"] = rangeHeader;
	}

	const upstream = await fetch(url, { headers });

	const contentType = upstream.headers.get("content-type");
	const contentLength = upstream.headers.get("content-length");
	const elapsed = Date.now() - startTime;

	streamLogger.log(
		`[stream] upstream response status=${upstream.status} content-type=${contentType ?? "unknown"} content-length=${contentLength ?? "unknown"} elapsed=${String(elapsed)}ms`,
	);

	if (!upstream.ok) {
		streamLogger.error(
			`[stream] upstream error status=${upstream.status} compositeId=${compositeId}`,
		);
	}

	// Forward relevant headers
	const responseHeaders = new Headers();
	if (contentType) responseHeaders.set("Content-Type", contentType);
	if (contentLength) responseHeaders.set("Content-Length", contentLength);

	const contentRange = upstream.headers.get("content-range");
	if (contentRange) responseHeaders.set("Content-Range", contentRange);

	const acceptRanges = upstream.headers.get("accept-ranges");
	if (acceptRanges) responseHeaders.set("Accept-Ranges", acceptRanges);
	else responseHeaders.set("Accept-Ranges", "bytes");

	responseHeaders.set("Access-Control-Allow-Origin", "*");
	responseHeaders.set("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length");

	return new Response(upstream.body, {
		status: upstream.status,
		headers: responseHeaders,
	});
}
