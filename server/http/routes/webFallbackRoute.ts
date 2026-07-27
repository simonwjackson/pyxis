import { join, resolve } from "node:path";
import type {
  ClientModeAuthority,
  ResolvedClientMode,
} from "../../services/clientMode.js";
import type { ServerRouteAdapter, StaticWebConfig } from "../types.js";

function injectClientMode(html: string, resolved: ResolvedClientMode): string {
  const script = `<script>window.__PYXIS_CLIENT_MODE__=${JSON.stringify(resolved.mode)};</script>`;
  return html.includes("</head>")
    ? html.replace("</head>", `${script}</head>`)
    : `${script}${html}`;
}

function documentResponse(
  request: Request,
  html: string,
  clientMode: ClientModeAuthority,
  init: {
    readonly status?: number;
    readonly headers?: Record<string, string>;
  } = {},
): Response {
  const resolved = clientMode.resolveDocumentMode(request);
  return new Response(injectClientMode(html, resolved), {
    ...(init.status === undefined ? {} : { status: init.status }),
    headers: {
      ...init.headers,
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Set-Cookie": resolved.setCookie,
    },
  });
}

export function createWebFallbackRoute(
  web: StaticWebConfig,
): ServerRouteAdapter {
  return async ({ req, url, clientMode }) => {
    if (web.serveStaticFiles) {
      const filePath = resolve(web.distDir, `.${url.pathname}`);
      if (
        url.pathname !== "/" &&
        url.pathname !== "/index.html" &&
        filePath.startsWith(web.distDir)
      ) {
        const file = Bun.file(filePath);
        if (await file.exists()) return new Response(file);
      }
      const html = await Bun.file(join(web.distDir, "index.html")).text();
      return documentResponse(req, html, clientMode);
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
      if (result.headers["content-type"]?.includes("text/html")) {
        return documentResponse(
          req,
          new TextDecoder().decode(result.body),
          clientMode,
          { status: result.status, headers: result.headers },
        );
      }
      return new Response(result.body, {
        status: result.status,
        headers: result.headers,
      });
    } catch {
      return new Response("Vite dev server not ready", { status: 502 });
    }
  };
}
