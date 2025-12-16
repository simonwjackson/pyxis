import { Effect } from "effect";
import * as Client from "../../client.js";
import type { PandoraSession } from "../../client.js";
import type { PandoraError } from "../../types/errors.js";
import { type ConfigError, SessionError } from "../../types/errors.js";
import { getSession, saveSession } from "../cache/session.js";
import { getCredentials } from "./getCredentials.js";

// Auth error code from Pandora API
const INVALID_AUTH_TOKEN = 1001;

/**
 * Check if an error is an authentication failure that can be retried
 */
const isAuthError = (error: PandoraError): boolean =>
	error._tag === "ApiCallError" && error.code === INVALID_AUTH_TOKEN;

/**
 * Attempt to login using credentials from config/env
 */
const loginWithCredentials = (): Effect.Effect<
	PandoraSession,
	ConfigError | PandoraError
> =>
	Effect.gen(function* () {
		const { username, password } = yield* getCredentials();
		const session = yield* Client.login(username, password);
		yield* Effect.promise(() => saveSession(session));
		return session;
	});

/**
 * Get existing session or create new one via login
 */
const getOrCreateSession = (): Effect.Effect<PandoraSession, PandoraError> =>
	Effect.gen(function* () {
		const cached = yield* Effect.promise(() => getSession());

		if (cached) {
			return cached;
		}

		// No cached session - try to login with credentials
		return yield* loginWithCredentials().pipe(
			Effect.mapError((error) => {
				if (error._tag === "ConfigError") {
					return new SessionError({ message: error.message });
				}
				return error;
			}),
		);
	});

/**
 * Options for withSession behavior
 */
export type WithSessionOptions = {
	readonly verbose?: boolean;
};

/**
 * Execute an API call with automatic session management and retry on auth failure.
 *
 * 1. Gets cached session or logs in using config credentials
 * 2. Executes the API call
 * 3. On auth error (code 1001), re-authenticates and retries once
 * 4. Returns result or propagates error
 */
export const withSession = <T, E extends PandoraError>(
	apiCall: (session: PandoraSession) => Effect.Effect<T, E>,
	options: WithSessionOptions = {},
): Effect.Effect<T, E | PandoraError> =>
	Effect.gen(function* () {
		const session = yield* getOrCreateSession();

		// Try the API call
		const result = yield* apiCall(session).pipe(
			Effect.catchAll((error) => {
				// If it's an auth error, try to re-authenticate and retry once
				if (isAuthError(error as PandoraError)) {
					if (options.verbose) {
						Effect.sync(() =>
							console.error(
								"[withSession] Auth token expired, re-authenticating...",
							),
						);
					}

					return Effect.gen(function* () {
						// Re-authenticate
						const newSession = yield* loginWithCredentials().pipe(
							Effect.mapError((e) => {
								if (e._tag === "ConfigError") {
									return new SessionError({
										message: e.message,
									}) as unknown as E;
								}
								return e as E;
							}),
						);

						// Retry the API call once
						return yield* apiCall(newSession);
					});
				}

				// Not an auth error, propagate it
				return Effect.fail(error);
			}),
		);

		return result;
	});

/**
 * Convenience function to get a session for use in commands that need
 * to make multiple API calls with the same session.
 */
export const ensureSession = (
	options: WithSessionOptions = {},
): Effect.Effect<PandoraSession, PandoraError> =>
	getOrCreateSession().pipe(
		Effect.tap(() => {
			if (options.verbose) {
				return Effect.sync(() => console.error("[withSession] Session ready"));
			}
			return Effect.void;
		}),
	);
