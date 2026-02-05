/**
 * @module stream
 * Audio streaming proxy with disk caching.
 * Fetches audio from source backends, caches to disk for non-Pandora sources,
 * and supports HTTP range requests for seeking.
 */

import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import envPaths from "env-paths";
import type { SourceManager } from "../../src/sources/index.js";
import type { SourceType } from "../../src/sources/types.js";
import { createLogger } from "../../src/logger.js";

const log = createLogger("stream").child({ component: "stream" });

// --- Audio cache ---

type CacheMeta = {
	readonly contentType: string;
	readonly contentLength: number;
	readonly cachedAt: string;
};

const CACHE_BASE = join(envPaths("pyxis", { suffix: "" }).cache, "audio");

function extensionForContentType(contentType: string): string {
	if (contentType.includes("webm")) return ".webm";
	if (contentType.includes("mp4") || contentType.includes("m4a")) return ".m4a";
	if (contentType.includes("ogg")) return ".ogg";
	if (contentType.includes("mpeg")) return ".mp3";
	return ".audio";
}

function cacheDirForSource(source: SourceType): string {
	return join(CACHE_BASE, source);
}

const KNOWN_EXTENSIONS = [".webm", ".m4a", ".ogg", ".mp3", ".audio"] as const;

function findCachedFile(source: SourceType, trackId: string): { filePath: string; metaPath: string } | null {
	const dir = cacheDirForSource(source);
	if (!existsSync(dir)) return null;
	for (const ext of KNOWN_EXTENSIONS) {
		const filePath = join(dir, `${trackId}${ext}`);
		const metaPath = `${filePath}.meta`;
		if (existsSync(filePath) && existsSync(metaPath)) {
			return { filePath, metaPath };
		}
	}
	return null;
}

function readMeta(metaPath: string): CacheMeta {
	return JSON.parse(readFileSync(metaPath, "utf-8")) as CacheMeta;
}

function ensureCacheDir(source: SourceType): void {
	mkdirSync(cacheDirForSource(source), { recursive: true });
}

// Active prefetches to avoid duplicate work
const activePrefetches = new Set<string>();

// --- Stream request types ---

/**
 * Parsed stream request containing source and track identifier.
 */
export type StreamRequest = {
	/** Source backend identifier */
	readonly source: SourceType;
	/** Source-specific track identifier */
	readonly trackId: string;
};

/**
 * Parses a composite track ID into source and track components.
 * Format: "source:trackId" (e.g., "ytmusic:dQw4w9WgXcQ")
 *
 * @param compositeId - Composite ID in "source:trackId" format
 * @returns Parsed source type and track ID
 */
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

/**
 * Encodes a source type and track ID into a composite ID string.
 *
 * @param source - Source backend identifier
 * @param trackId - Source-specific track identifier
 * @returns Composite ID in "source:trackId" format
 */
export function encodeTrackId(source: SourceType, trackId: string): string {
	return `${source}:${trackId}`;
}

/**
 * Resolves a composite track ID to a streamable audio URL.
 *
 * @param sourceManager - Source manager for URL resolution
 * @param compositeId - Composite ID in "source:trackId" format
 * @returns Direct audio stream URL
 */
export async function resolveStreamUrl(
	sourceManager: SourceManager,
	compositeId: string,
): Promise<string> {
	const { source, trackId } = parseTrackId(compositeId);
	return sourceManager.getStreamUrl(source, trackId);
}

// --- Cache hit: serve from disk ---

function serveCachedFile(
	filePath: string,
	meta: CacheMeta,
	rangeHeader: string | null,
): Response {
	const responseHeaders = new Headers();
	responseHeaders.set("Content-Type", meta.contentType);
	responseHeaders.set("Accept-Ranges", "bytes");
	responseHeaders.set("Access-Control-Allow-Origin", "*");
	responseHeaders.set("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length");

	const fileSize = meta.contentLength;

	if (rangeHeader) {
		const match = rangeHeader.match(/^bytes=(\d+)-(\d*)$/);
		if (match?.[1]) {
			const start = Number.parseInt(match[1], 10);
			const end = match[2] ? Number.parseInt(match[2], 10) : fileSize - 1;
			const chunkSize = end - start + 1;

			responseHeaders.set("Content-Length", String(chunkSize));
			responseHeaders.set("Content-Range", `bytes ${String(start)}-${String(end)}/${String(fileSize)}`);

			const file = Bun.file(filePath);
			const slice = file.slice(start, end + 1);
			return new Response(slice, { status: 206, headers: responseHeaders });
		}
	}

	responseHeaders.set("Content-Length", String(fileSize));
	return new Response(Bun.file(filePath), { status: 200, headers: responseHeaders });
}

// --- Cache miss: stream-through (tee to client + cache file) ---

async function streamThroughAndCache(
	upstream: globalThis.Response,
	source: SourceType,
	trackId: string,
	contentType: string,
	contentLength: number | null,
): Promise<Response> {
	ensureCacheDir(source);
	const ext = extensionForContentType(contentType);
	const finalPath = join(cacheDirForSource(source), `${trackId}${ext}`);
	const partialPath = `${finalPath}.partial`;
	const metaPath = `${finalPath}.meta`;

	const upstreamBody = upstream.body;
	if (!upstreamBody) {
		return new Response(null, { status: upstream.status, headers: upstream.headers });
	}

	const writer = Bun.file(partialPath).writer();
	let totalWritten = 0;

	const teeStream = new ReadableStream({
		async start(controller) {
			const reader = upstreamBody.getReader();
			try {
				for (;;) {
					const { done, value } = await reader.read();
					if (done) break;
					controller.enqueue(value);
					writer.write(value);
					totalWritten += value.byteLength;
				}
				controller.close();
				await writer.end();

				renameSync(partialPath, finalPath);
				const meta: CacheMeta = {
					contentType,
					contentLength: totalWritten,
					cachedAt: new Date().toISOString(),
				};
				writeFileSync(metaPath, JSON.stringify(meta));
				log.info({ trackId, size: totalWritten }, "cached");
			} catch (err) {
				controller.error(err);
				try { await writer.end(); } catch { /* ignore cleanup failure */ }
				try { unlinkSync(partialPath); } catch { /* ignore cleanup failure */ }
			}
		},
	});

	const responseHeaders = new Headers();
	responseHeaders.set("Content-Type", contentType);
	if (contentLength !== null) responseHeaders.set("Content-Length", String(contentLength));

	const contentRange = upstream.headers.get("content-range");
	if (contentRange) responseHeaders.set("Content-Range", contentRange);

	responseHeaders.set("Accept-Ranges", "bytes");
	responseHeaders.set("Access-Control-Allow-Origin", "*");
	responseHeaders.set("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length");

	return new Response(teeStream, {
		status: upstream.status,
		headers: responseHeaders,
	});
}

// --- Prefetch ---

/**
 * Prefetches a track to the local cache in the background.
 * Skips Pandora tracks (short-lived URLs) and already-cached tracks.
 * Deduplicates concurrent prefetch requests for the same track.
 *
 * @param sourceManager - Source manager for URL resolution
 * @param compositeId - Composite ID of track to prefetch
 */
export async function prefetchToCache(
	sourceManager: SourceManager,
	compositeId: string,
): Promise<void> {
	const { source, trackId } = parseTrackId(compositeId);

	// Skip Pandora (short-lived URLs)
	if (source === "pandora") return;

	if (findCachedFile(source, trackId)) {
		log.info({ compositeId }, "prefetch skip (cached)");
		return;
	}

	if (activePrefetches.has(compositeId)) {
		log.info({ compositeId }, "prefetch skip (in-flight)");
		return;
	}

	activePrefetches.add(compositeId);
	log.info({ compositeId }, "prefetch start");

	try {
		const url = await resolveStreamUrl(sourceManager, compositeId);
		const upstream = await fetch(url);

		if (!upstream.ok || !upstream.body) {
			log.error({ status: upstream.status, compositeId }, "prefetch upstream error");
			return;
		}

		const contentType = upstream.headers.get("content-type") ?? "audio/webm";
		ensureCacheDir(source);
		const ext = extensionForContentType(contentType);
		const finalPath = join(cacheDirForSource(source), `${trackId}${ext}`);
		const partialPath = `${finalPath}.partial`;
		const metaPath = `${finalPath}.meta`;

		const writer = Bun.file(partialPath).writer();
		const reader = upstream.body.getReader();
		let totalWritten = 0;

		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			writer.write(value);
			totalWritten += value.byteLength;
		}
		await writer.end();

		renameSync(partialPath, finalPath);
		const meta: CacheMeta = {
			contentType,
			contentLength: totalWritten,
			cachedAt: new Date().toISOString(),
		};
		writeFileSync(metaPath, JSON.stringify(meta));
		log.info({ compositeId, size: totalWritten }, "prefetch complete");
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		log.error({ compositeId, err: message }, "prefetch failed");
	} finally {
		activePrefetches.delete(compositeId);
	}
}

/**
 * Handles an audio stream request, serving from cache or fetching upstream.
 * For non-Pandora sources, caches the response to disk on first request.
 * Supports HTTP range requests for seeking within cached files.
 *
 * @param sourceManager - Source manager for URL resolution
 * @param compositeId - Composite ID of track to stream
 * @param rangeHeader - HTTP Range header for partial content requests
 * @returns HTTP Response with audio stream
 */
export async function handleStreamRequest(
	sourceManager: SourceManager,
	compositeId: string,
	rangeHeader: string | null,
): Promise<Response> {
	const startTime = Date.now();
	const { source, trackId } = parseTrackId(compositeId);
	log.info({ compositeId, range: rangeHeader ?? "none" }, "request");

	// Only cache non-Pandora sources (Pandora URLs are short-lived)
	if (source !== "pandora") {
		const cached = findCachedFile(source, trackId);
		if (cached) {
			const meta = readMeta(cached.metaPath);
			const elapsedMs = Date.now() - startTime;
			log.info({ compositeId, elapsedMs }, "cache hit");
			return serveCachedFile(cached.filePath, meta, rangeHeader);
		}
	}

	// Cache miss (or Pandora) — resolve URL and fetch upstream
	log.info({ compositeId }, "cache miss");

	let url: string;
	try {
		url = await resolveStreamUrl(sourceManager, compositeId);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		log.error({ compositeId, err: message }, "resolve failed");
		throw err;
	}

	try {
		const parsedUrl = new URL(url);
		log.info({ host: parsedUrl.host, path: parsedUrl.pathname.slice(0, 40) }, "upstream");
	} catch {
		log.info("upstream url non-parseable");
	}

	const headers: Record<string, string> = {};
	if (rangeHeader) {
		headers["Range"] = rangeHeader;
	}

	const upstream = await fetch(url, { headers });

	const contentType = upstream.headers.get("content-type");
	const contentLength = upstream.headers.get("content-length");
	const elapsedMs = Date.now() - startTime;

	log.info(
		{ status: upstream.status, contentType: contentType ?? "unknown", contentLength: contentLength ?? "unknown", elapsedMs },
		"upstream response",
	);

	if (!upstream.ok) {
		log.error({ status: upstream.status, compositeId }, "upstream error");
		const responseHeaders = new Headers();
		if (contentType) responseHeaders.set("Content-Type", contentType);
		responseHeaders.set("Access-Control-Allow-Origin", "*");
		return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
	}

	// For non-Pandora sources on full (non-range) requests, tee the stream to cache
	if (source !== "pandora" && !rangeHeader && contentType) {
		return streamThroughAndCache(
			upstream,
			source,
			trackId,
			contentType,
			contentLength ? Number.parseInt(contentLength, 10) : null,
		);
	}

	// Pandora or range requests on uncached files: pass through without caching
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
