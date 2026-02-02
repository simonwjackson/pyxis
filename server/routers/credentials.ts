import { z } from "zod";
import { router, publicProcedure } from "../trpc.js";
import {
	listCredentials,
	addCredential,
	removeCredential,
	testCredential,
} from "../services/credentials.js";
import { getSourceManager, setGlobalSourceManager, invalidateManagers } from "../services/sourceManager.js";
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

	add: publicProcedure
		.input(
			z.object({
				source: sourceSchema,
				username: z.string().min(1),
				password: z.string().min(1),
			}),
		)
		.mutation(async ({ input }) => {
			try {
				const { id, session } = await addCredential(
					input.source,
					input.username,
					input.password,
				);

				// If a Pandora session was created, rebuild the source manager
				if (session.type === "pandora") {
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

	remove: publicProcedure
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
