/**
 * @module pandora/api/auth
 *
 * Pandora authentication API implementing the two-step login flow:
 * 1. Partner login (unencrypted) - establishes device identity and receives sync time
 * 2. User login (Blowfish encrypted) - authenticates user credentials
 *
 * All subsequent API calls require tokens from both steps.
 */
import { Effect } from "effect";
import { PANDORA_API_URL, ANDROID_DEVICE } from "../constants.js";
import { decrypt, encryptJson } from "../crypto/index.js";
import { PartnerLoginError, UserLoginError } from "../types/errors.js";
import type { PartnerLoginResponse, UserLoginResponse } from "../types/api.js";
import { httpRequest } from "../http/client.js";

const unixTimestamp = (): number => Math.floor(Date.now() / 1000);

const calculateSyncTime = (
	encryptedTime: string,
): Effect.Effect<number, PartnerLoginError> =>
	decrypt(ANDROID_DEVICE.decryptKey)(encryptedTime).pipe(
		Effect.map((decrypted) => {
			const timeStr = decrypted.slice(4);
			const serverTime = parseInt(timeStr, 10);
			return unixTimestamp() - serverTime;
		}),
		Effect.mapError(
			(e) =>
				new PartnerLoginError({
					message: "Failed to calculate sync time",
					cause: e,
				}),
		),
	);

/**
 * Performs partner-level authentication with Pandora using device credentials.
 * This is the first step of the authentication flow and must be completed
 * before user login. The syncTimeOffset returned is critical for all subsequent
 * encrypted API calls.
 *
 * @returns Partner authentication response with sync time offset for time synchronization
 *
 * @effect
 * - Success: PartnerLoginResponse & { syncTimeOffset } - partner tokens and time offset
 * - Error: PartnerLoginError - when partner authentication fails or sync time decryption fails
 */
export const partnerLogin = (): Effect.Effect<
	PartnerLoginResponse & { readonly syncTimeOffset: number },
	PartnerLoginError
> =>
	Effect.gen(function* () {
		const params = new URLSearchParams({
			method: "auth.partnerLogin",
		});

		const body = JSON.stringify({
			username: ANDROID_DEVICE.username,
			password: ANDROID_DEVICE.password,
			deviceModel: ANDROID_DEVICE.deviceId,
			version: "5",
			includeUrls: true,
		});

		const json = yield* httpRequest<PartnerLoginResponse>({
			url: `${PANDORA_API_URL}?${params}`,
			method: "POST",
			headers: { "Content-Type": "text/plain" },
			body,
			apiMethod: "auth.partnerLogin",
		}).pipe(
			Effect.mapError(
				(e) =>
					new PartnerLoginError({
						message: e.message,
						cause: e.cause,
					}),
			),
		);

		if (json.stat !== "ok") {
			return yield* Effect.fail(
				new PartnerLoginError({
					message: "Partner login failed",
				}),
			);
		}

		const syncTimeOffset = yield* calculateSyncTime(json.result.syncTime);

		return { ...json.result, syncTimeOffset };
	});

/**
 * Creates a user login function bound to partner credentials.
 * This is the second step of authentication, requiring partner tokens from partnerLogin.
 * The request body is encrypted using Blowfish ECB with the device encrypt key.
 *
 * @param partnerId - Partner ID from partnerLogin response
 * @param partnerAuthToken - Partner auth token from partnerLogin response
 * @param syncTimeOffset - Time offset calculated during partnerLogin for sync time
 * @returns Curried function that accepts user credentials and returns login effect
 *
 * @example
 * ```ts
 * const partner = yield* partnerLogin();
 * const user = yield* userLogin(
 *   partner.partnerId,
 *   partner.partnerAuthToken,
 *   partner.syncTimeOffset
 * )(username, password);
 * ```
 *
 * @effect
 * - Success: UserLoginResponse - user tokens for authenticated API calls
 * - Error: UserLoginError - when user credentials are invalid or encryption fails
 */
export const userLogin =
	(partnerId: string, partnerAuthToken: string, syncTimeOffset: number) =>
	(
		username: string,
		password: string,
	): Effect.Effect<UserLoginResponse, UserLoginError> =>
		Effect.gen(function* () {
			const params = new URLSearchParams({
				method: "auth.userLogin",
				auth_token: partnerAuthToken,
				partner_id: partnerId,
			});

			const payload = {
				loginType: "user",
				username,
				password,
				partnerAuthToken,
				syncTime: unixTimestamp() + syncTimeOffset,
			};

			const body = yield* encryptJson(ANDROID_DEVICE.encryptKey)(payload).pipe(
				Effect.mapError(
					(e) =>
						new UserLoginError({
							message: "Encryption failed",
							cause: e,
						}),
				),
			);

			const json = yield* httpRequest<UserLoginResponse>({
				url: `${PANDORA_API_URL}?${params}`,
				method: "POST",
				headers: { "Content-Type": "text/plain" },
				body,
				apiMethod: "auth.userLogin",
			}).pipe(
				Effect.mapError(
					(e) =>
						new UserLoginError({
							message: e.message,
							cause: e.cause,
						}),
				),
			);

			if (json.stat !== "ok") {
				return yield* Effect.fail(
					new UserLoginError({
						message: "User login failed",
					}),
				);
			}

			return json.result;
		});
