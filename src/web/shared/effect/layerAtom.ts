/**
 * @module @app/web/shared/effect/layerAtom
 *
 * Override seam for the RPC client protocol layer. The default value is the
 * live browser HTTP transport ({@link liveRpcProtocolLayer}); harnesses and
 * tests can replace this atom's value to inject an in-memory RPC transport
 * without touching feature code.
 *
 * Per the Effect runtime conventions (`@effect/atom-react`), this atom is the
 * single seam that production wiring, Storybook composition roots, and unit
 * tests share. Atoms downstream (`rpcClient.ts`, `runtime.ts`) read this
 * atom rather than constructing a layer directly so the swap is mechanical.
 */

import { Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { Atom } from "effect/unstable/reactivity";
import { RpcClient, RpcSerialization } from "effect/unstable/rpc";
import type { Protocol } from "effect/unstable/rpc/RpcClient";

/**
 * Live browser RPC protocol layer.
 *
 * Production posture: NDJSON over HTTP POST to `/rpc` using the global
 * `fetch` with credentials so the existing same-origin auth cookie/session
 * model continues to work after the cutover. The exact wire endpoint is
 * mounted by U7 (`server/index.ts`); this layer only names it.
 */
export const liveRpcProtocolLayer: Layer.Layer<Protocol> =
	RpcClient.layerProtocolHttp({
		url: "/rpc",
	}).pipe(
		Layer.provide(RpcSerialization.layerNdjson),
		Layer.provide(FetchHttpClient.layer),
	);

/**
 * Override-able protocol layer atom. Default value is {@link liveRpcProtocolLayer}.
 *
 * To override in tests / Storybook:
 * ```ts
 * const registry = AtomRegistry.make()
 * registry.set(rpcProtocolLayerAtom, inMemoryProtocolLayer)
 * ```
 */
export const rpcProtocolLayerAtom: Atom.Writable<Layer.Layer<Protocol>> =
	Atom.make<Layer.Layer<Protocol>>(liveRpcProtocolLayer);
