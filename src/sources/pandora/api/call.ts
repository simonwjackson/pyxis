/**
 * @module pandora/api/call
 * Low-level Pandora API call helper for authenticated requests.
 * Handles sync time calculation, payload encryption, and response validation.
 */
import { Effect } from "effect";
import { PANDORA_API_URL, ANDROID_DEVICE } from "../constants.js";
import { encryptJson } from "../crypto/index.js";
import { ApiCallError } from "../types/errors.js";
import type { ApiResponse, ApiErrorResponse } from "../types/api.js";
import { httpRequest } from "../http/client.js";

/**
 * Authentication state required for making API calls.
 * Contains all tokens and timing data from the two-step authentication flow.
 */
export type AuthState = {
	/** Time offset between client and Pandora server (seconds) */
	readonly syncTime: number;
	readonly partnerId: string;
	readonly partnerAuthToken: string;
	readonly userId: string;
	readonly userAuthToken: string;
};

const unixTimestamp = (): number => Math.floor(Date.now() / 1000);

/**
 * Makes an authenticated call to a Pandora API method.
 * Automatically handles sync time injection and optional Blowfish encryption.
 *
 * @typeParam T - Expected response result type
 * @param state - Authentication state with all required tokens
 * @param method - Pandora API method name (e.g., "user.getStationList")
 * @param data - Request payload data (without auth fields)
 * @param options - Options controlling encryption
 * @returns The API result extracted from the response wrapper
 *
 * @effect
 * - Success: T - the result field from the API response
 * - Error: ApiCallError - when the API returns an error or encryption fails
 *
 * @example
 * ```ts
 * const stations = yield* callPandoraMethod<StationListResponse>(
 *   authState,
 *   "user.getStationList",
 *   { includeStationArtUrl: true },
 *   { encrypted: true }
 * );
 * ```
 */
export const callPandoraMethod = <T>(
	state: AuthState,
	method: string,
	data: Record<string, unknown>,
	options: { encrypted: boolean },
): Effect.Effect<T, ApiCallError> =>
	Effect.gen(function* () {
		const syncTime = unixTimestamp() + state.syncTime;

		const params = new URLSearchParams({
			method,
			auth_token: state.userAuthToken,
			partner_id: state.partnerId,
			user_id: state.userId,
		});

		const payload = {
			...data,
			userAuthToken: state.userAuthToken,
			syncTime,
		};

		const body = options.encrypted
			? yield* encryptJson(ANDROID_DEVICE.encryptKey)(payload).pipe(
					Effect.mapError(
						(e) =>
							new ApiCallError({
								method,
								message: "Encryption failed",
								cause: e,
							}),
					),
				)
			: JSON.stringify(payload);

		const response = yield* httpRequest<T>({
			url: `${PANDORA_API_URL}?${params}`,
			method: "POST",
			headers: { "Content-Type": "text/plain" },
			body,
			apiMethod: method,
		});

		if (response.stat !== "ok") {
			const errorResponse = response as unknown as ApiErrorResponse;
			return yield* Effect.fail(
				new ApiCallError({
					method,
					message: errorResponse.message ?? "API returned error status",
					code: errorResponse.code,
				}),
			);
		}

		return response.result;
	});
