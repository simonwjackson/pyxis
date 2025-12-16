import { Command } from "commander";
import { Effect } from "effect";
import pc from "picocolors";
import * as Client from "../../../client.js";
import { findStationOrFail } from "../utils/findStation.js";
import { runEffect } from "../../errors/handler.js";
import { withSession } from "../../utils/withSession.js";
import type { GlobalOptions } from "../../index.js";

async function likeCommand(
	trackToken: string,
	options: GlobalOptions & { station: string },
): Promise<void> {
	const effect = Effect.gen(function* () {
		const stationList = yield* withSession(
			(session) => Client.getStationList(session),
			{ verbose: options.verbose },
		);

		const station = yield* findStationOrFail(
			stationList.stations,
			options.station,
		);

		const feedback = yield* withSession(
			(session) =>
				Client.addFeedback(session, station.stationToken, trackToken, true),
			{ verbose: options.verbose },
		);

		return feedback;
	});

	const feedback = await runEffect(effect, {
		verbose: options.verbose,
		json: options.json,
	});

	if (options.json) {
		console.log(JSON.stringify({ success: true, data: feedback }, null, 2));
		return;
	}

	console.log(pc.green("Thumbs up added!"));
	console.log("Song: " + pc.bold(feedback.songName));
	console.log("Artist: " + pc.bold(feedback.artistName));
	console.log("Feedback ID: " + pc.dim(feedback.feedbackId));
}

export function registerLikeCommand(parent: Command): void {
	parent
		.command("like <track-token>")
		.description("Give a track a thumbs up")
		.requiredOption("-s, --station <name>", "Station name or token")
		.action(async (trackToken: string, cmdOpts: { station: string }) => {
			const program = parent.parent;
			if (!program) {
				throw new Error("Could not access parent program");
			}
			const globalOpts = program.opts<GlobalOptions>();
			await likeCommand(trackToken, {
				...globalOpts,
				station: cmdOpts.station,
			});
		});
}
