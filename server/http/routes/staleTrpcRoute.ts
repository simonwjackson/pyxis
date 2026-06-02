import type { CorsConfig, ServerRouteAdapter } from "../types.js";

export function createStaleTrpcRoute(cors: CorsConfig): ServerRouteAdapter {
  return ({ url }) => {
    if (!url.pathname.startsWith("/trpc")) return null;
    return new Response("The tRPC API has been removed. Use /rpc.", {
      status: 410,
      headers: { "Content-Type": "text/plain", ...cors.headers },
    });
  };
}
