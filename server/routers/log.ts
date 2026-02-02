import { z } from "zod";
import { router, publicProcedure } from "../trpc.js";
import { createLogger } from "../../src/logger.js";

const log = createLogger("playback");

export const logRouter = router({
	client: publicProcedure
		.input(z.object({ message: z.string() }))
		.mutation(({ input }) => {
			log.log(`[client] ${input.message}`);
			return { ok: true };
		}),
});
