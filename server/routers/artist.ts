import { z } from "zod";
import { router, publicProcedure } from "../trpc.js";

// Stub router for Phase 3+ — artist entity operations
export const artistRouter = router({
	get: publicProcedure
		.input(z.object({ id: z.string() }))
		.query(({ input }) => {
			return { id: input.id };
		}),

	search: publicProcedure
		.input(z.object({ query: z.string() }))
		.query(() => {
			return { artists: [] };
		}),
});
