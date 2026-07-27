import type { ServerRouteAdapter } from "../types.js";

export function createClientModeRoute(): ServerRouteAdapter {
  return ({ req, url, clientMode }) => {
    if (url.pathname !== "/client-mode/authorize") return null;
    if (req.method !== "GET") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "GET" },
      });
    }
    const clientId = url.searchParams.get("clientId") ?? "";
    const authorization = clientMode.authorizeClient(req, clientId);
    if (!authorization) {
      return Response.json(
        { error: "invalid_client_id" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json(authorization, {
      headers: { "Cache-Control": "no-store" },
    });
  };
}
