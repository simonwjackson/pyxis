/**
 * @module listenLogRouter
 * tRPC router for querying the listen log (played track history).
 */

import { z } from "zod";
import { router, publicProcedure } from "../trpc.js";
import { getDb } from "../../src/db/index.js";

export const listenLogRouter = router({
	list: publicProcedure
		.input(
			z.object({
				limit: z.number().min(1).max(200).default(50),
				offset: z.number().min(0).default(0),
			}),
		)
		.query(async ({ input }) => {
			const db = await getDb();
			return db.listenLog.query({
				sort: { listenedAt: "desc" },
				limit: input.limit,
				offset: input.offset,
			}).runPromise;
		}),
});
