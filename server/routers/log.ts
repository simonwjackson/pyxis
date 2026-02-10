/**
 * @module server/routers/log
 * Client-side logging router for receiving log messages from the web frontend.
 * Allows the browser client to send logs to the server for unified logging.
 */

import { z } from "zod";
import { router, publicProcedure } from "../trpc.js";
import { createLogger } from "../../src/logger.js";

const log = createLogger("playback").child({ component: "client" });

/**
 * Log router providing client-to-server log forwarding.
 *
 * Endpoints:
 * - `client` - Forward a log message from the web client to server logs
 */
export const logRouter = router({
	client: publicProcedure
		.input(z.object({ message: z.string() }))
		.mutation(({ input }) => {
			log.info({ clientMsg: input.message }, "client log");
			return { ok: true };
		}),
});
