import { Effect } from "effect";
import { router, protectedProcedure } from "../trpc.js";
import * as Pandora from "../../src/sources/pandora/client.js";

export const genresRouter = router({
	list: protectedProcedure.query(async ({ ctx }) => {
		const result = await Effect.runPromise(
			Pandora.getGenreStations(ctx.pandoraSession),
		);
		return result.categories;
	}),
});
