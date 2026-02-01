import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router.js";
import { createContext } from "./trpc.js";
import {
	handleWebSocketUpgrade,
	handleWSOpen,
	handleWSMessage,
	handleWSClose,
} from "./handlers/websocket.js";

const PORT = 3847;

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
			return new Response(null, {
				headers: {
					"Access-Control-Allow-Origin": "http://localhost:5173",
					"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
					"Access-Control-Allow-Headers": "Content-Type",
					"Access-Control-Allow-Credentials": "true",
				},
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
				// Add CORS headers
				const headers = new Headers(response.headers);
				headers.set(
					"Access-Control-Allow-Origin",
					"http://localhost:5173",
				);
				headers.set("Access-Control-Allow-Credentials", "true");

				// Set session cookie if login response contains sessionId
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

console.log(`Server running on http://localhost:${PORT}`);
