import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router.js";
import { createContext } from "./trpc.js";
import {
	handleWebSocketUpgrade,
	handleWSOpen,
	handleWSMessage,
	handleWSClose,
} from "./handlers/websocket.js";
import { handleStreamRequest, prefetchToCache } from "./services/stream.js";
import { ensureSourceManager } from "./services/sourceManager.js";
import { tryAutoLogin } from "./services/autoLogin.js";
import { decodeId } from "./lib/ids.js";
import { createLogger } from "../src/logger.js";

const serverLogger = createLogger("server");

const PORT = 8765;

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "http://aka:5678",
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, Range",
	"Access-Control-Allow-Credentials": "true",
} as const;

const server = Bun.serve({
	port: PORT,
	fetch(req, server) {
		const url = new URL(req.url);

		// WebSocket upgrade
		if (url.pathname === "/ws") {
			const wsData = handleWebSocketUpgrade(req);
			if (wsData && server.upgrade(req, { data: wsData })) {
				return;
			}
			return new Response("Unauthorized", { status: 401 });
		}

		// CORS preflight
		if (req.method === "OPTIONS") {
			return new Response(null, { headers: CORS_HEADERS });
		}

		// Stream endpoint: /stream/:opaqueId (accepts opaque base64 IDs)
		if (url.pathname.startsWith("/stream/")) {
			const opaqueId = decodeURIComponent(
				url.pathname.slice("/stream/".length),
			);
			// Decode opaque ID to composite format for internal use
			let compositeId: string;
			try {
				const decoded = decodeId(opaqueId);
				compositeId = `${decoded.source}:${decoded.id}`;
			} catch {
				// Fallback: treat as raw composite ID for backwards compatibility
				compositeId = opaqueId;
			}
			const rangeHeader = req.headers.get("range");
			const nextHint = url.searchParams.get("next");
			serverLogger.log(`[stream] incoming ${compositeId} range=${rangeHeader ?? "none"} next=${nextHint ?? "none"}`);
			return ensureSourceManager()
				.then((sourceManager) => {
					const responsePromise = handleStreamRequest(sourceManager, compositeId, rangeHeader);
					if (nextHint) {
						let nextCompositeId: string;
						try {
							const decoded = decodeId(decodeURIComponent(nextHint));
							nextCompositeId = `${decoded.source}:${decoded.id}`;
						} catch {
							nextCompositeId = decodeURIComponent(nextHint);
						}
						prefetchToCache(sourceManager, nextCompositeId).catch((err: unknown) => {
							const msg = err instanceof Error ? err.message : String(err);
							serverLogger.error(`[stream] prefetch error next=${nextHint}: ${msg}`);
						});
					}
					return responsePromise;
				})
				.catch((err: unknown) => {
					const message =
						err instanceof Error ? err.message : "Stream error";
					serverLogger.error(`[stream] error compositeId=${compositeId}: ${message}`);
					return new Response(message, {
						status: 502,
						headers: { "Access-Control-Allow-Origin": "*" },
					});
				});
		}

		// tRPC handler
		if (url.pathname.startsWith("/trpc")) {
			return fetchRequestHandler({
				endpoint: "/trpc",
				req,
				router: appRouter,
				createContext: () => createContext(req),
			}).then((response) => {
				const headers = new Headers(response.headers);
				headers.set("Access-Control-Allow-Origin", "http://aka:5678");
				headers.set("Access-Control-Allow-Credentials", "true");

				return new Response(response.body, {
					status: response.status,
					headers,
				});
			});
		}

		return new Response("Not Found", { status: 404 });
	},
	websocket: {
		open: handleWSOpen,
		message: handleWSMessage,
		close: handleWSClose,
	},
});

serverLogger.log(`Server running on http://aka:${PORT}`);
serverLogger.log(`Logs: ${serverLogger.logFile}`);

// Attempt auto-login from stored credentials
tryAutoLogin(serverLogger).catch(() => {
	// Silently ignore — server starts normally without auth
});
