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
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { join, resolve } from "node:path";
import type { ViteDevServer } from "vite";
import { resolveConfig } from "@shared/config.js";
import { createLogger } from "@shared/logger.js";
import {
  createAndroidMediaBridge,
  isAndroidMediaBridgeRequest,
} from "./lib/androidMediaBridge.js";
import { createHealthResponse, isHealthRequest } from "./lib/health.js";
import { resolveTrackForStream } from "./lib/ids.js";
import { handleRpcRequest } from "./rpc/http.js";
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

/** Bridge a web request through Vite's Connect middleware stack */
function handleViteRequest(
  middleware: ViteDevServer["middlewares"],
  method: string,
  url: string,
  headers: Record<string, string>,
): Promise<{
  status: number;
  headers: Record<string, string>;
  body: ArrayBuffer;
}> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    const req = new IncomingMessage(socket);
    req.method = method;
    req.url = url;
    req.headers = {};
    for (const [k, v] of Object.entries(headers)) {
      req.headers[k.toLowerCase()] = v;
    }
    req.push(null);

    const res = new ServerResponse(req);
    const chunks: Buffer[] = [];

    res.write = ((chunk: string | Uint8Array) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      return true;
    }) as typeof res.write;

    res.end = ((chunk?: string | Uint8Array) => {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const responseHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(res.getHeaders())) {
        if (v != null) responseHeaders[k] = String(v);
      }
      resolve({
        status: res.statusCode,
        headers: responseHeaders,
        body: (() => {
          const joined = Buffer.concat(chunks);
          const copied = new Uint8Array(joined.length);
          copied.set(joined);
          return copied.buffer;
        })(),
      });
      return res;
    }) as typeof res.end;

    middleware.handle(req, res, (err?: unknown) => {
      if (err) {
        reject(err);
      } else {
        resolve({
          status: 404,
          headers: { "content-type": "text/plain" },
          body: new TextEncoder().encode("Not Found").buffer,
        });
      }
    });
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

const _server = Bun.serve({
  port: config.server.port,
  error(err) {
    serverLogger.error({ err: err.message }, "unhandled server error");
    return new Response("Internal Server Error", { status: 500 });
  },
  async fetch(req) {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (isHealthRequest(url, req.method)) {
      return createHealthResponse();
    }

    if (isAndroidMediaBridgeRequest(url)) {
      return androidMediaBridge.handle(req);
    }

    // Stream endpoint: /stream/:opaqueId (accepts nanoid or source:id)
    if (url.pathname.startsWith("/stream/")) {
      const opaqueId = decodeURIComponent(
        url.pathname.slice("/stream/".length),
      );
      const rangeHeader = req.headers.get("range");
      const nextHint = url.searchParams.get("next");
      const decodedNextHint = nextHint ? decodeURIComponent(nextHint) : null;
      const requestedFormatRaw = url.searchParams.get("format");
      const requestedFormat = requestedFormatRaw === "mp3" ? "mp3" : undefined;
      if (requestedFormatRaw !== null && requestedFormat === undefined) {
        return new Response(`Unsupported format: ${requestedFormatRaw}`, {
          status: 400,
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      }
      streamLog.info(
        {
          opaqueId,
          range: rangeHeader ?? "none",
          next: decodedNextHint ?? "none",
          format: requestedFormat ?? "none",
        },
        "incoming",
      );
      return resolveTrackForStream(opaqueId)
        .then((compositeId) =>
          ensureSourceManager().then((sourceManager) => {
            const responsePromise = handleStreamRequest(
              sourceManager,
              compositeId,
              rangeHeader,
              {
                abortSignal: req.signal,
                ...(requestedFormat ? { requestedFormat } : {}),
              },
            );
            if (decodedNextHint) {
              resolveTrackForStream(decodedNextHint)
                .then((nextCompositeId) =>
                  prefetchToCache(sourceManager, nextCompositeId),
                )
                .catch((err: unknown) => {
                  const msg = err instanceof Error ? err.message : String(err);
                  streamLog.error(
                    { next: decodedNextHint, err: msg },
                    "prefetch error",
                  );
                });
            }
            return responsePromise;
          }),
        )
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : "Stream error";
          streamLog.error({ opaqueId, err: message }, "stream error");
          return new Response(message, {
            status: 502,
            headers: { "Access-Control-Allow-Origin": "*" },
          });
        });
    }

    // Effect RPC application endpoint.
    if (url.pathname === "/rpc") {
      return handleRpcRequest(req)
        .then((response) => {
          response.headers.set("Access-Control-Allow-Origin", corsOrigin);
          response.headers.set("Access-Control-Allow-Credentials", "true");
          return response;
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          rpcLog.error({ err: message }, "unhandled RPC error");
          return new Response("Internal server error", {
            status: 500,
            headers: { "Content-Type": "text/plain", ...CORS_HEADERS },
          });
        });
    }

    // Removed API endpoint: fail stale clients closed instead of serving SPA.
    if (url.pathname.startsWith("/trpc")) {
      return new Response("The tRPC API has been removed. Use /rpc.", {
        status: 410,
        headers: { "Content-Type": "text/plain", ...CORS_HEADERS },
      });
    }

    // Static file serving (production build)
    if (serveStaticFiles) {
      const filePath = resolve(DIST_DIR, `.${url.pathname}`);
      if (filePath.startsWith(DIST_DIR)) {
        const file = Bun.file(filePath);
        if (await file.exists()) {
          return new Response(file);
        }
      }
      // SPA fallback: serve index.html for client-side routing
      return new Response(Bun.file(join(DIST_DIR, "index.html")));
    }

    // Dev mode: pipe through Vite middleware in-process
    if (viteDevServer) {
      try {
        const headers: Record<string, string> = {};
        req.headers.forEach((v, k) => {
          headers[k] = v;
        });
        const result = await handleViteRequest(
          viteDevServer.middlewares,
          req.method,
          `${url.pathname}${url.search}`,
          headers,
        );
        return new Response(result.body, {
          status: result.status,
          headers: result.headers,
        });
      } catch {
        return new Response("Vite dev server not ready", { status: 502 });
      }
    }

    return new Response("Not Found", { status: 404 });
  },
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
