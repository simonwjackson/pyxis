/**
 * @module pandora/types/errors
 * Tagged error types for Pandora API operations using Effect's error handling.
 * All errors are discriminated unions with a _tag property for pattern matching.
 */

import { Data } from "effect";

/**
 * Error during Blowfish encryption of API request payload.
 */
export class EncryptionError extends Data.TaggedError("EncryptionError")<{
	readonly message: string;
	readonly cause?: unknown;
}> {}

/**
 * Error during Blowfish decryption of API response data (e.g., syncTime).
 */
export class DecryptionError extends Data.TaggedError("DecryptionError")<{
	readonly message: string;
	readonly cause?: unknown;
}> {}

/**
 * Error during partner authentication (first step of login flow).
 * Indicates invalid device credentials or Pandora API unavailability.
 */
export class PartnerLoginError extends Data.TaggedError("PartnerLoginError")<{
	readonly message: string;
	readonly cause?: unknown;
}> {}

/**
 * Error during user authentication (second step of login flow).
 * Indicates invalid username/password or account issues.
 */
export class UserLoginError extends Data.TaggedError("UserLoginError")<{
	readonly message: string;
	readonly cause?: unknown;
}> {}

/**
 * Error from a Pandora API call after authentication.
 * Contains the API method name and error code for debugging.
 */
export class ApiCallError extends Data.TaggedError("ApiCallError")<{
	/** The Pandora API method that failed (e.g., "user.getStationList") */
	readonly method: string;
	readonly message: string;
	/** Pandora error code (e.g., 1001 for invalid auth token) */
	readonly code?: number;
	readonly cause?: unknown;
}> {}

/**
 * Error in configuration (missing credentials, invalid settings).
 */
export class ConfigError extends Data.TaggedError("ConfigError")<{
	readonly message: string;
}> {}

/**
 * Resource not found error (station, track, bookmark doesn't exist).
 */
export class NotFoundError extends Data.TaggedError("NotFoundError")<{
	readonly message: string;
}> {}

/**
 * Session-related error (expired token, invalid session state).
 */
export class SessionError extends Data.TaggedError("SessionError")<{
	readonly message: string;
}> {}

/**
 * Union of all Pandora error types for exhaustive error handling.
 * Use pattern matching on the _tag property to handle specific errors.
 *
 * @example
 * ```ts
 * Effect.catchTag("UserLoginError", (e) => ...)
 * ```
 */
export type PandoraError =
	| EncryptionError
	| DecryptionError
	| PartnerLoginError
	| UserLoginError
	| ApiCallError
	| ConfigError
	| NotFoundError
	| SessionError;
