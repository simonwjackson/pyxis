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
