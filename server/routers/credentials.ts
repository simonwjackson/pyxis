import { router, publicProcedure } from "../trpc.js";

// Stub router for Phase 4 — multi-credential management
export const credentialsRouter = router({
	list: publicProcedure.query(() => {
		return { credentials: [] };
	}),
});
