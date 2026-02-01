import { router, publicProcedure } from "../trpc.js";

// Stub router for Phase 3 — queue management
export const queueRouter = router({
	get: publicProcedure.query(() => {
		return { tracks: [] };
	}),
});
