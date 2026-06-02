/**
 * @module server/rpc/http
 *
 * Bun-compatible web handler for the Effect RPC application endpoint. This
 * module adapts the Effect HTTP/RPC runtime to the repository's existing
 * manual `Bun.serve` routing so `/stream`, static files, Vite middleware,
 * and Android bridge handling can stay plain HTTP.
 */

import { PyxisRpc } from "@shared/api/rpc.js";
import { Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { RpcSerialization, RpcServer } from "effect/unstable/rpc";
import { PyxisRpcLayerLive } from "./handler.js";

const rpcLayer = RpcServer.layerHttp({
  group: PyxisRpc,
  path: "/rpc",
  protocol: "http",
  spanPrefix: "rpc.server",
}).pipe(
  Layer.provide(PyxisRpcLayerLive),
  Layer.provide(RpcSerialization.layerNdjson),
);

const rpcHttp = HttpRouter.toWebHandler(rpcLayer, { disableLogger: true });

export const disposeRpcHttpHandler = rpcHttp.dispose;

const rpcWebHandler = rpcHttp.handler as (req: Request) => Promise<Response>;

export function handleRpcRequest(req: Request): Promise<Response> {
  return rpcWebHandler(req);
}
