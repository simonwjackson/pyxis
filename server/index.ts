import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router.js";
import { createContext } from "./trpc.js";
import { handleStreamRequest, prefetchToCache } from "./services/stream.js";
import { ensureSourceManager, setAppConfig } from "./services/sourceManager.js";
import { tryAutoLogin } from "./services/autoLogin.js";
import { resolveTrackForStream } from "./lib/ids.js";
import { createLogger } from "../src/logger.js";
import { resolveConfig } from "../src/config.js";

const configFlagIndex = process.argv.indexOf("--config");
const configPath = configFlagIndex !== -1 ? process.argv[configFlagIndex + 1] : undefined;
const config = resolveConfig(configPath);
setAppConfig(config);

const serverLogger = createLogger("server");
const streamLog = serverLogger.child({ component: "stream" });
const trpcLog = serverLogger.child({ component: "trpc" });

const corsOrigin = `http://${config.server.hostname}:${config.web.port}`;

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": corsOrigin,
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, Range",
	"Access-Control-Allow-Credentials": "true",
} as const;

const server = Bun.serve({
	port: config.server.port,
	fetch(req) {
		const url = new URL(req.url);

		// CORS preflight
		if (req.method === "OPTIONS") {
			return new Response(null, { headers: CORS_HEADERS });
		}

		// Stream endpoint: /stream/:opaqueId (accepts nanoid or source:id)
		if (url.pathname.startsWith("/stream/")) {
			const opaqueId = decodeURIComponent(url.pathname.slice("/stream/".length));
			const rangeHeader = req.headers.get("range");
			const nextHint = url.searchParams.get("next");
			const decodedNextHint = nextHint ? decodeURIComponent(nextHint) : null;
			streamLog.info({ opaqueId, range: rangeHeader ?? "none", next: decodedNextHint ?? "none" }, "incoming");
			return resolveTrackForStream(opaqueId)
				.then((compositeId) =>
					ensureSourceManager().then((sourceManager) => {
						const responsePromise = handleStreamRequest(sourceManager, compositeId, rangeHeader);
						if (decodedNextHint) {
							resolveTrackForStream(decodedNextHint)
								.then((nextCompositeId) =>
									prefetchToCache(sourceManager, nextCompositeId),
								)
								.catch((err: unknown) => {
									const msg = err instanceof Error ? err.message : String(err);
									streamLog.error({ next: decodedNextHint, err: msg }, "prefetch error");
								});
						}
						return responsePromise;
					}),
				)
				.catch((err: unknown) => {
					const message =
						err instanceof Error ? err.message : "Stream error";
					streamLog.error({ opaqueId, err: message }, "stream error");
					return new Response(message, {
						status: 502,
						headers: { "Access-Control-Allow-Origin": "*" },
					});
				});
		}

		// tRPC handler (includes SSE subscriptions via GET)
		if (url.pathname.startsWith("/trpc")) {
			const trpcPath = url.pathname.replace("/trpc/", "").replace("/trpc", "");
			if (trpcPath && !trpcPath.includes("player.") && !trpcPath.includes("queue.") && !trpcPath.includes("log.")) {
				trpcLog.info({ method: req.method, path: trpcPath }, "request");
			}
			return fetchRequestHandler({
				endpoint: "/trpc",
				req,
				router: appRouter,
				createContext: () => createContext(req),
			}).then((response) => {
				// Set CORS headers directly on the original response to preserve
				// SSE stream lifecycle (wrapping in new Response() disconnects
				// the tRPC subscription cleanup signals, causing listener drops)
				response.headers.set("Access-Control-Allow-Origin", corsOrigin);
				response.headers.set("Access-Control-Allow-Credentials", "true");
				if (trpcPath.includes("radio.getTracks")) {
					trpcLog.info({ path: "radio.getTracks", status: response.status }, "response");
				}
				return response;
			});
		}

		return new Response("Not Found", { status: 404 });
	},
});

serverLogger.info({ port: config.server.port }, "server running");

// Attempt auto-login from config credentials
tryAutoLogin(serverLogger, config).catch(() => {
	// Silently ignore — server starts normally without auth
});
