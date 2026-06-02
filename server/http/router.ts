import { createAndroidMediaBridgeRoute } from "./routes/androidMediaBridgeRoute.js";
import { createHealthRoute } from "./routes/healthRoute.js";
import { createRpcRoute } from "./routes/rpcRoute.js";
import { createStaleTrpcRoute } from "./routes/staleTrpcRoute.js";
import { createStreamRoute } from "./routes/streamRoute.js";
import { createWebFallbackRoute } from "./routes/webFallbackRoute.js";
import type {
  ServerFetchHandlerConfig,
  ServerRouteAdapter,
  ServerRouteContext,
} from "./types.js";

function createServerRouteAdapters(
  config: ServerFetchHandlerConfig,
): readonly ServerRouteAdapter[] {
  return [
    createHealthRoute(),
    createAndroidMediaBridgeRoute(config.androidMediaBridge),
    createStreamRoute(config.stream),
    createRpcRoute(config.rpc),
    createStaleTrpcRoute(config.cors),
    createWebFallbackRoute(config.web),
  ];
}

export function createServerFetchHandler(
  config: ServerFetchHandlerConfig,
): (req: Request) => Promise<Response> {
  const routes = createServerRouteAdapters(config);

  return async (req) => {
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: config.cors.headers });
    }

    const context: ServerRouteContext = {
      req,
      url: new URL(req.url),
      cors: config.cors,
    };

    for (const route of routes) {
      const response = await route(context);
      if (response) return response;
    }

    return new Response("Not Found", { status: 404 });
  };
}
