/**
 * @module server/rpc/http
 *
 * Bun-compatible web handler for the Effect RPC application endpoint. This
 * module adapts the Effect HTTP/RPC runtime to the repository's existing
 * manual `Bun.serve` routing so `/stream`, static files, Vite middleware,
 * and Android bridge handling can stay plain HTTP.
 */

import { Effect, Layer } from "effect";
import { HttpEffect } from "effect/unstable/http";
import { RpcSerialization, RpcServer } from "effect/unstable/rpc";
import { PyxisRpc } from "@shared/api/rpc.js";
import { PyxisRpcLayerLive } from "./handler.js";

const rpcLayer = PyxisRpcLayerLive.pipe(
  Layer.provide(RpcSerialization.layerNdjson),
);

const rpcApp = Effect.flatten(
  RpcServer.toHttpEffect(PyxisRpc, { spanPrefix: "rpc.server" }),
);

const rpcHttp = HttpEffect.toWebHandlerLayer(rpcApp, rpcLayer);

export const disposeRpcHttpHandler = rpcHttp.dispose;

const rpcWebHandler = rpcHttp.handler as (req: Request) => Promise<Response>;

export function handleRpcRequest(req: Request): Promise<Response> {
  return rpcWebHandler(req);
}
