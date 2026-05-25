/**
 * @module @app/web/shared/effect/projectQueryResult
 *
 * Adapter that narrows an Effect RPC query `AsyncResult<A, ApiPublicError | RpcClientError>`
 * into an `AsyncResult<A, ApiPublicError>` by routing transport-level errors
 * (`RpcClientError` and other unrecognized errors) into the failure's defect
 * channel.
 *
 * Feature `*State.fromResult` modules consume the narrowed shape so the UI
 * never branches on raw transport internals (per the plan's R6/R7 boundary
 * between typed public errors and defects).
 */

import { Cause } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import type { RpcClientError } from "effect/unstable/rpc/RpcClientError";
import type { ApiPublicError } from "../../../api/contracts/common.js";

/**
 * Project a query AsyncResult into the narrow `AsyncResult<A, ApiPublicError>`
 * shape used by feature state ADTs. Transport-level errors (RpcClientError or
 * anything that is not an {@link ApiPublicError}) become defects so the
 * feature ADT's `LoadError` case stays restricted to allow-listed
 * domain errors.
 */
export function projectQueryResult<A>(
	result: AsyncResult.AsyncResult<A, ApiPublicError | RpcClientError>,
): AsyncResult.AsyncResult<A, ApiPublicError> {
	if (result._tag !== "Failure") {
		return result as AsyncResult.AsyncResult<A, ApiPublicError>;
	}
	const found = Cause.findErrorOption(result.cause);
	if (found._tag === "Some" && isApiPublicError(found.value)) {
		return result as AsyncResult.AsyncResult<A, ApiPublicError>;
	}
	const defect = found._tag === "Some" ? found.value : result.cause;
	return AsyncResult.failure<A, ApiPublicError>(Cause.die(defect));
}

const PUBLIC_ERROR_TAGS = new Set<string>([
	"ValidationError",
	"Unauthorized",
	"AuthRefreshFailed",
	"NotFound",
	"SourceUnavailable",
	"PersistenceError",
	"UpstreamProviderError",
	"StaleCommand",
	"StaleReport",
	"Defect",
]);

function isApiPublicError(value: unknown): value is ApiPublicError {
	if (typeof value !== "object" || value === null) return false;
	const tag = (value as { _tag?: unknown })._tag;
	return typeof tag === "string" && PUBLIC_ERROR_TAGS.has(tag);
}
