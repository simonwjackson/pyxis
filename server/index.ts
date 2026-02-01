import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router.js";
import { createContext } from "./trpc.js";
import {
	handleWebSocketUpgrade,
	handleWSOpen,
	handleWSMessage,
	handleWSClose,
} from "./handlers/websocket.js";
import { handleStreamRequest } from "./services/stream.js";
import { ensureSourceManager } from "./services/sourceManager.js";

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

		// Stream endpoint: /stream/:compositeTrackId
		if (url.pathname.startsWith("/stream/")) {
			const compositeId = decodeURIComponent(
				url.pathname.slice("/stream/".length),
			);
			const rangeHeader = req.headers.get("range");
			return ensureSourceManager()
				.then((sourceManager) =>
					handleStreamRequest(sourceManager, compositeId, rangeHeader),
				)
				.catch((err: unknown) => {
					const message =
						err instanceof Error ? err.message : "Stream error";
					return new Response(message, { status: 502 });
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

console.log(`Server running on http://aka:${PORT}`);
