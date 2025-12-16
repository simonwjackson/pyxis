import { Command } from "commander";
import pc from "picocolors";
import { getTrack } from "../../../client.js";
import type { GetTrackResponse } from "../../../types/api.js";
import { runEffect } from "../../errors/handler.js";
import { withSession } from "../../utils/withSession.js";
import type { GlobalOptions } from "../../index.js";

type InfoCommandOptions = GlobalOptions;

function formatTrackInfo(
	track: GetTrackResponse,
	options: { json: boolean },
): string {
	if (options.json) {
		const response = {
			success: true,
			data: track,
		};
		return JSON.stringify(response, null, 2);
	}

	const titleText = track.songName + " by " + track.artistName;
	const title = pc.bold(titleText);
	const separator = "=".repeat(Math.min(titleText.length, 60));

	let output = title + "\n" + separator + "\n";
	output += "\n" + pc.bold("Album") + ": " + track.albumName;
	output += "\n" + pc.bold("Track Token") + ": " + track.trackToken;

	if (track.musicToken) {
		output += "\n" + pc.bold("Music Token") + ": " + track.musicToken;
	}

	if (track.songRating !== undefined) {
		output += "\n" + pc.bold("Rating") + ": " + track.songRating;
	}

	if (track.artUrl) {
		output += "\n" + pc.bold("Album Art") + ": " + track.artUrl;
	}

	if (track.songDetailUrl) {
		output += "\n" + pc.bold("Song Details") + ": " + track.songDetailUrl;
	}

	if (track.artistDetailUrl) {
		output += "\n" + pc.bold("Artist Details") + ": " + track.artistDetailUrl;
	}

	if (track.albumDetailUrl) {
		output += "\n" + pc.bold("Album Details") + ": " + track.albumDetailUrl;
	}

	return output;
}

export function registerInfoCommand(program: Command): void {
	program
		.command("info <track-token>")
		.description("Get detailed information about a track")
		.action(async (trackToken: string, command: Command) => {
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

			const effect = withSession((session) => getTrack(session, trackToken), {
				verbose: globalOpts.verbose,
			});

			const result = await runEffect(effect, {
				verbose: globalOpts.verbose,
				json: globalOpts.json,
			});

			const output = formatTrackInfo(result, {
				json: globalOpts.json,
			});

			console.log(output);
		});
}
