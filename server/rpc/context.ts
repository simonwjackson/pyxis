/**
 * @module server/rpc/context
 * Shared request-shape types for Effect RPC handlers.
 *
 * Handlers do not consume an ambient tRPC `Context` any more. They consume
 * the Effect service layer instead, and pull session/source-manager through
 * the {@link AuthSession} service. This module names the types that the
 * service layer exposes so handlers can reference them without depending on
 * the old `server/trpc.ts` shape.
 */

import type { SourceManager } from "../../src/sources/index.js";
import type { PandoraSession } from "../../src/sources/pandora/client.js";

/**
 * The full request-time view of authenticated state plus the active source
 * aggregator. Returned by {@link AuthSession.requireSession} as a single
 * record so handlers do not need two service calls in the hot path.
 */
export type RpcSessionContext = {
	readonly pandoraSession: PandoraSession;
	readonly sourceManager: SourceManager;
};
