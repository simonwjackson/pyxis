import { Command } from "commander";
import pc from "picocolors";
import * as Client from "../../../client.js";
import { runEffect } from "../../errors/handler.js";
import { withSession } from "../../utils/withSession.js";
import type { GlobalOptions } from "../../index.js";

async function unfeedbackCommand(
	feedbackId: string,
	options: GlobalOptions,
): Promise<void> {
	const effect = withSession(
		(session) => Client.deleteFeedback(session, feedbackId),
		{ verbose: options.verbose },
	);

	await runEffect(effect, { verbose: options.verbose, json: options.json });

	if (options.json) {
		console.log(
			JSON.stringify({ success: true, message: "Feedback removed" }, null, 2),
		);
		return;
	}

	console.log(pc.green("Feedback removed successfully"));
}

export function registerUnfeedbackCommand(parent: Command): void {
	parent
		.command("unfeedback <feedback-id>")
		.description("Remove a rating (thumbs up/down)")
		.action(async (feedbackId: string) => {
			const program = parent.parent;
			if (!program) {
				throw new Error("Could not access parent program");
			}
			const opts = program.opts<GlobalOptions>();
			await unfeedbackCommand(feedbackId, opts);
		});
}
