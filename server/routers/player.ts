import { router, publicProcedure } from "../trpc.js";

// Stub router for Phase 3 — player state management
export const playerRouter = router({
	state: publicProcedure.query(() => {
		return { playing: false, trackId: null };
	}),
});
