import { join, resolve } from "node:path";
import type { ServerRouteAdapter, StaticWebConfig } from "../types.js";

export function createWebFallbackRoute(
  web: StaticWebConfig,
): ServerRouteAdapter {
  return async ({ req, url }) => {
    if (web.serveStaticFiles) {
      const filePath = resolve(web.distDir, `.${url.pathname}`);
      if (filePath.startsWith(web.distDir)) {
        const file = Bun.file(filePath);
        if (await file.exists()) return new Response(file);
      }
      return new Response(Bun.file(join(web.distDir, "index.html")));
    }

    if (!web.viteDevServer) return null;

    try {
      const headers: Record<string, string> = {};
      req.headers.forEach((v, k) => {
        headers[k] = v;
      });
      const result = await web.handleViteRequest(
        web.viteDevServer.middlewares,
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
  };
}
