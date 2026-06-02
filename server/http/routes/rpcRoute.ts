import type { RpcRouteDeps, ServerRouteAdapter } from "../types.js";

async function normalizeRpcRequest(req: Request): Promise<Request> {
  const rpcUrl = new URL(req.url);
  rpcUrl.pathname = "/rpc";
  const init: RequestInit = {
    method: req.method,
    headers: req.headers,
    signal: req.signal,
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }
  return new Request(rpcUrl.toString(), init);
}

export function createRpcRoute(deps: RpcRouteDeps): ServerRouteAdapter {
  return async ({ req, url, cors }) => {
    if (url.pathname !== "/rpc" && url.pathname !== "/rpc/") return null;

    try {
      const response = await deps.handleRpcRequest(
        await normalizeRpcRequest(req),
      );
      response.headers.set("Access-Control-Allow-Origin", cors.origin);
      response.headers.set("Access-Control-Allow-Credentials", "true");
      return response;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      deps.log.error({ err: message }, "unhandled RPC error");
      return new Response("Internal server error", {
        status: 500,
        headers: { "Content-Type": "text/plain", ...cors.headers },
      });
    }
  };
}
