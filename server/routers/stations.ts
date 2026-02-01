import { z } from "zod";
import { Effect } from "effect";
import { router, protectedProcedure } from "../trpc.js";
import * as Pandora from "../../src/client.js";

export const stationsRouter = router({
	list: protectedProcedure.query(async ({ ctx }) => {
		const result = await Effect.runPromise(
			Pandora.getStationList(ctx.pandoraSession),
		);
		return result.stations;
	}),

	getStation: protectedProcedure
		.input(z.object({ stationToken: z.string() }))
		.query(async ({ ctx, input }) => {
			return Effect.runPromise(
				Pandora.getStation(ctx.pandoraSession, {
					stationToken: input.stationToken,
					includeExtendedAttributes: true,
				}),
			);
		}),

	create: protectedProcedure
		.input(
			z.object({
				musicToken: z.string().optional(),
				trackToken: z.string().optional(),
				musicType: z.enum(["song", "artist"]).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			return Effect.runPromise(
				Pandora.createStation(ctx.pandoraSession, input),
			);
		}),

	delete: protectedProcedure
		.input(z.object({ stationToken: z.string() }))
		.mutation(async ({ ctx, input }) => {
			await Effect.runPromise(
				Pandora.deleteStation(ctx.pandoraSession, input),
			);
			return { success: true };
		}),

	rename: protectedProcedure
		.input(
			z.object({
				stationToken: z.string(),
				stationName: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			return Effect.runPromise(
				Pandora.renameStation(ctx.pandoraSession, input),
			);
		}),
});
