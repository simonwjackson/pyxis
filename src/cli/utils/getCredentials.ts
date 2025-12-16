import { Effect } from "effect";
import { ConfigError } from "../../types/errors.js";
import { loadConfig } from "../config/loader.js";

export type Credentials = {
	readonly username: string;
	readonly password: string;
};

export const getCredentials = (): Effect.Effect<Credentials, ConfigError> =>
	Effect.gen(function* () {
		const config = yield* Effect.promise(() => loadConfig());

		const username = config.auth?.username ?? process.env.PANDORA_USERNAME;
		const password = config.auth?.password ?? process.env.PANDORA_PASSWORD;

		if (!username || !password) {
			return yield* Effect.fail(
				new ConfigError({
					message:
						"Pandora credentials not found. Set via config file or PANDORA_USERNAME/PANDORA_PASSWORD environment variables.",
				}),
			);
		}

		return { username, password };
	});
