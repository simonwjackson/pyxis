import { Command } from "commander";
import pc from "picocolors";
import { shareMusic } from "../../../client.js";
import { runEffect } from "../../errors/handler.js";
import { withSession } from "../../utils/withSession.js";
import type { GlobalOptions } from "../../index.js";

type ShareCommandOptions = GlobalOptions;

function formatShareSuccess(
	musicToken: string,
	email: string,
	options: { json: boolean },
): string {
	if (options.json) {
		const response = {
			success: true,
			data: {
				musicToken,
				email,
				message: "Track shared successfully",
			},
		};
		return JSON.stringify(response, null, 2);
	}

	return pc.green("✓") + " Track shared successfully with " + pc.bold(email);
}

export function registerShareCommand(program: Command): void {
	program
		.command("share <music-token> <email>")
		.description("Share a track via email")
		.action(async (musicToken: string, email: string, command: Command) => {
			const parentCommand = command.parent as Command & {
				parent?: Command & { optsWithGlobals?: () => GlobalOptions };
			};
			const globalOpts: GlobalOptions =
				parentCommand.parent?.optsWithGlobals?.() ?? {
					json: false,
					cache: true,
					verbose: false,
					quiet: false,
				};

			const effect = withSession(
				(session) => shareMusic(session, musicToken, email),
				{ verbose: globalOpts.verbose },
			);

			await runEffect(effect, {
				verbose: globalOpts.verbose,
				json: globalOpts.json,
			});

			const output = formatShareSuccess(musicToken, email, {
				json: globalOpts.json,
			});

			console.log(output);
		});
}
