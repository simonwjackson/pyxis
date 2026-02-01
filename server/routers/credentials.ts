import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../trpc.js";
import {
	listCredentials,
	addCredential,
	removeCredential,
	testCredential,
} from "../services/credentials.js";
import { getSourceManager, setGlobalSourceManager, invalidateManagers } from "../services/sourceManager.js";
import { updateSessionPandora } from "../services/session.js";
import { TRPCError } from "@trpc/server";

const sourceSchema = z.enum(["pandora", "ytmusic", "local"]);

export const credentialsRouter = router({
	list: publicProcedure.query(async () => {
		const creds = await listCredentials();
		return creds.map((c) => ({
			id: c.id,
			source: c.source,
			username: c.username,
			hasSession: c.hasSession,
			createdAt: c.createdAt.toISOString(),
			updatedAt: c.updatedAt.toISOString(),
		}));
	}),

	add: protectedProcedure
		.input(
			z.object({
				source: sourceSchema,
				username: z.string().min(1),
				password: z.string().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const { id, session } = await addCredential(
					input.source,
					input.username,
					input.password,
				);

				// If a Pandora session was created, update the current session context
				// and rebuild the source manager
				if (session.type === "pandora" && ctx.sessionId) {
					updateSessionPandora(ctx.sessionId, session.session);
					invalidateManagers();
					setGlobalSourceManager(await getSourceManager(session.session));
				}

				return {
					id,
					source: input.source,
					username: input.username,
					hasSession: true,
				};
			} catch {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Failed to validate ${input.source} credentials`,
				});
			}
		}),

	remove: protectedProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ input }) => {
			await removeCredential(input.id);
			invalidateManagers();
			return { success: true };
		}),

	test: publicProcedure
		.input(
			z.object({
				source: sourceSchema,
				username: z.string().min(1),
				password: z.string().min(1),
			}),
		)
		.mutation(async ({ input }) => {
			const valid = await testCredential(
				input.source,
				input.username,
				input.password,
			);
			return { valid };
		}),
});
