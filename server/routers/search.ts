import { z } from "zod";
import { Effect } from "effect";
import { router, protectedProcedure } from "../trpc.js";
import * as Pandora from "../../src/client.js";

export const searchRouter = router({
	search: protectedProcedure
		.input(z.object({ searchText: z.string().min(1) }))
		.query(async ({ ctx, input }) => {
			return Effect.runPromise(
				Pandora.search(ctx.pandoraSession, input.searchText),
			);
		}),
});
