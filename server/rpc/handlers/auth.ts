/**
 * @module server/rpc/handlers/auth
 * Effect RPC handlers for the `auth.*` family. Mirrors the procedure
 * semantics of `server/routers/auth.ts`:
 *
 * - `auth.status.get` is unauthenticated and reports whether a Pandora
 *   session is currently configured.
 * - `auth.settings.get`, `auth.usage.get`, `auth.settings.change`, and
 *   `auth.explicitFilter.set` require an authenticated Pandora session and
 *   inherit the coalesced refresh-and-retry semantics from
 *   {@link AuthSession.withAuthRetry}.
 */

import { Effect } from "effect";
import type {
	ApiChangeSettingsInput,
	ApiSetExplicitFilterInput,
} from "../../../src/api/contracts/auth.js";
import * as Pandora from "../../../src/sources/pandora/client.js";
import { getPandoraSessionFromCredentials } from "../../services/credentials.js";
import { publicHandler } from "../handler.js";
import type { AuthSessionShape } from "../services/authSession.js";

export type AuthHandlerDeps = {
	readonly auth: AuthSessionShape;
};

export const authHandlers = (deps: AuthHandlerDeps) => ({
	"auth.status.get": () =>
		Effect.sync(() => ({
			authenticated: true,
			hasPandora: getPandoraSessionFromCredentials() != null,
		})),

	"auth.settings.get": () =>
		publicHandler(
			deps.auth.withAuthRetry((ctx) => Pandora.getSettings(ctx.pandoraSession)),
		),

	"auth.usage.get": () =>
		publicHandler(
			deps.auth.withAuthRetry((ctx) =>
				Pandora.getUsageInfo(ctx.pandoraSession),
			),
		),

	"auth.settings.change": (payload: ApiChangeSettingsInput) =>
		publicHandler(
			deps.auth
				.withAuthRetry((ctx) => {
					const settings: Record<string, unknown> = {};
					if (payload.isExplicitContentFilterEnabled !== undefined) {
						settings.isExplicitContentFilterEnabled =
							payload.isExplicitContentFilterEnabled;
					}
					if (payload.isProfilePrivate !== undefined) {
						settings.isProfilePrivate = payload.isProfilePrivate;
					}
					if (payload.zipCode !== undefined) {
						settings.zipCode = payload.zipCode;
					}
					return Pandora.changeSettings(
						ctx.pandoraSession,
						settings as Parameters<typeof Pandora.changeSettings>[1],
					);
				})
				.pipe(Effect.map(() => ({ success: true as const }))),
		),

	"auth.explicitFilter.set": (payload: ApiSetExplicitFilterInput) =>
		publicHandler(
			deps.auth
				.withAuthRetry((ctx) =>
					Pandora.setExplicitContentFilter(ctx.pandoraSession, payload.enabled),
				)
				.pipe(Effect.map(() => ({ success: true as const }))),
		),
});
