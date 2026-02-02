import { z } from "zod";
import { router, publicProcedure } from "../trpc.js";
import { createLogger } from "../../src/logger.js";

const log = createLogger("playback").child({ component: "client" });

export const logRouter = router({
	client: publicProcedure
		.input(z.object({ message: z.string() }))
		.mutation(({ input }) => {
			log.info({ clientMsg: input.message }, "client log");
			return { ok: true };
		}),
});
