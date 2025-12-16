import { Command } from "commander";
import pc from "picocolors";
import * as Client from "../../../client.js";
import { runEffect } from "../../errors/handler.js";
import { withSession } from "../../utils/withSession.js";
import type { GlobalOptions } from "../../index.js";

async function sleepCommand(
	trackToken: string,
	options: GlobalOptions,
): Promise<void> {
	const effect = withSession(
		(session) => Client.sleepSong(session, trackToken),
		{ verbose: options.verbose },
	);

	await runEffect(effect, { verbose: options.verbose, json: options.json });

	if (options.json) {
		console.log(
			JSON.stringify(
				{ success: true, message: "Song marked as tired" },
				null,
				2,
			),
		);
		return;
	}

	console.log(pc.blue("Song marked as tired (will not play for 30 days)"));
}

export function registerSleepCommand(parent: Command): void {
	parent
		.command("sleep <track-token>")
		.description("Mark a track as tired (will not play for 30 days)")
		.action(async (trackToken: string) => {
			const program = parent.parent;
			if (!program) {
				throw new Error("Could not access parent program");
			}
			const opts = program.opts<GlobalOptions>();
			await sleepCommand(trackToken, opts);
		});
}
