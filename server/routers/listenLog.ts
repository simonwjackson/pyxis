/**
 * @module listenLogRouter
 * tRPC router for querying the listen log (played track history).
 */

import { z } from "zod";
import { router, publicProcedure } from "../trpc.js";
import { getDb, schema } from "../../src/db/index.js";
import { desc } from "drizzle-orm";

export const listenLogRouter = router({
	list: publicProcedure
		.input(
			z.object({
				limit: z.number().min(1).max(200).default(50),
				offset: z.number().min(0).default(0),
			}),
		)
		.query(({ input }) => {
			const db = getDb();
			return db
				.select()
				.from(schema.listenLog)
				.orderBy(desc(schema.listenLog.listenedAt))
				.limit(input.limit)
				.offset(input.offset);
		}),
});
