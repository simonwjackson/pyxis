/**
 * @module server/index
 * Main HTTP server entry point for Pyxis music server.
 * Sets up Bun HTTP server with the Effect RPC endpoint, audio streaming proxy,
 * CORS handling, and static/Vite web serving.
 *
 * Server endpoints:
 * - `/rpc` - Effect RPC API
 * - `/stream/:compositeTrackId` - Audio streaming proxy with caching
 * - `/*` - Static files from dist-web/ with SPA fallback (production only)
 *
 * @example
 * ```bash
 * # Start server with default config
 * bun run server/index.ts
 *
 * # Start with custom config path
 * bun run server/index.ts --config /path/to/config.yaml
 * ```
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveConfig } from "@shared/config.js";
import { createLogger } from "@shared/logger.js";
import type { ViteDevServer } from "vite";
import { createServerFetchHandler } from "./http/router.js";
import { handleViteRequest } from "./http/vite.js";
import { createAndroidMediaBridge } from "./lib/androidMediaBridge.js";
import { resolveTrackForStream } from "./lib/ids.js";
import { handleRpcRequest } from "./rpc/http.js";
import { setConfiguredAlbumRelationshipPolicy } from "./services/albumRelationshipPolicy.js";
import { tryAutoLogin } from "./services/autoLogin.js";
import { setCredentialsConfig } from "./services/credentials.js";
import { ensureSourceManager, setAppConfig } from "./services/sourceManager.js";
import { handleStreamRequest, prefetchToCache } from "./services/stream.js";

const configFlagIndex = process.argv.indexOf("--config");
const configPath =
  configFlagIndex !== -1 ? process.argv[configFlagIndex + 1] : undefined;
const config = resolveConfig(configPath);
setAppConfig(config);
setCredentialsConfig(config);
setConfiguredAlbumRelationshipPolicy(config);

const serverLogger = createLogger("server");
const streamLog = serverLogger.child({ component: "stream" });
const rpcLog = serverLogger.child({ component: "rpc" });
const androidMediaBridge = createAndroidMediaBridge(config.androidBridge);

// Static file serving is enabled when a production build exists and Vite dev mode
// is not explicitly requested.
const DIST_DIR = join(import.meta.dirname, "../dist-web");
const hasDistWeb = existsSync(DIST_DIR);
const forceViteDev = process.env.PYXIS_WEB_DEV === "1";
const serveStaticFiles = hasDistWeb && !forceViteDev;

// --- Vite dev server (middleware mode) ---

let viteDevServer: ViteDevServer | null = null;
if (!serveStaticFiles) {
  const vite = await import("vite");
  viteDevServer = await vite.createServer({
    server: {
      middlewareMode: true,
      hmr: { port: config.server.port + 1 },
    },
    appType: "spa",
  });
}

// With Vite embedded, frontend is always same-origin in dev mode too
const corsOrigin = `http://${config.server.hostname}:${config.server.port}`;

/**
 * Standard CORS headers for cross-origin requests from the web frontend.
 * Allows credentials and common HTTP methods/headers for API access.
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": corsOrigin,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Range",
  "Access-Control-Allow-Credentials": "true",
} as const;

const fetch = createServerFetchHandler({
  cors: {
    origin: corsOrigin,
    headers: CORS_HEADERS,
  },
  androidMediaBridge,
  stream: {
    log: streamLog,
    resolveTrackForStream,
    ensureSourceManager,
    handleStreamRequest,
    prefetchToCache,
  },
  rpc: {
    log: rpcLog,
    handleRpcRequest,
  },
  web: {
    distDir: DIST_DIR,
    serveStaticFiles,
    viteDevServer,
    handleViteRequest,
  },
});

const _server = Bun.serve({
  port: config.server.port,
  error(err) {
    serverLogger.error({ err: err.message }, "unhandled server error");
    return new Response("Internal Server Error", { status: 500 });
  },
  fetch,
});

serverLogger.info(
  {
    port: config.server.port,
    staticFiles: serveStaticFiles,
    viteDev: !serveStaticFiles,
    forceViteDev,
  },
  "server running",
);
// Attempt auto-login from config credentials
tryAutoLogin(serverLogger, config).catch(() => {
  // Silently ignore — server starts normally without auth
});
