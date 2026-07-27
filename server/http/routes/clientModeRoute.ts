import type { ApiClientMode } from "@shared/api/contracts/clientMode.js";
import type { ServerRouteAdapter } from "../types.js";

function noStoreJson(
  value: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return Response.json(value, {
    ...init,
    headers: { ...init.headers, "Cache-Control": "no-store" },
  });
}

export function createClientModeRoute(): ServerRouteAdapter {
  return async ({ req, url, clientMode }) => {
    if (url.pathname === "/client-mode/authorize") {
      if (req.method !== "GET") {
        return new Response("Method Not Allowed", {
          status: 405,
          headers: { Allow: "GET" },
        });
      }
      const clientId = url.searchParams.get("clientId") ?? "";
      const authorization = clientMode.authorizeClient(req, clientId);
      return authorization
        ? noStoreJson(authorization)
        : noStoreJson({ error: "invalid_client_id" }, { status: 400 });
    }

    if (url.pathname !== "/client-mode") return null;
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "POST" },
      });
    }

    let input: { mode?: unknown; clientId?: unknown };
    try {
      input = (await req.json()) as { mode?: unknown; clientId?: unknown };
    } catch {
      return noStoreJson({ error: "invalid_request" }, { status: 400 });
    }
    const mode: ApiClientMode | undefined =
      input.mode === "player" || input.mode === "console"
        ? input.mode
        : undefined;
    const clientId = typeof input.clientId === "string" ? input.clientId : "";
    if (!mode) {
      return noStoreJson({ error: "invalid_mode" }, { status: 400 });
    }
    const resolved = clientMode.setClientMode(mode, clientId);
    if (!resolved) {
      return noStoreJson({ error: "invalid_client_id" }, { status: 400 });
    }
    return noStoreJson(
      { mode: resolved.mode },
      { headers: { "Set-Cookie": resolved.setCookie } },
    );
  };
}
