import { Command } from "commander";
import { Effect } from "effect";
import pc from "picocolors";
import * as Client from "../../../client.js";
import { getAudioUrl, QUALITY_INFO } from "../../../quality.js";
import type { Quality } from "../../../quality.js";
import type { PandoraError } from "../../../types/errors.js";
import { runEffect } from "../../errors/handler.js";
import {
	formatTable,
	formatError,
	type OutputOptions,
} from "../../output/formatter.js";
import { generateM3U, generateURLList } from "../../output/m3u.js";
import { withSession } from "../../utils/withSession.js";
import type { GlobalOptions } from "../../index.js";

type Format = "full" | "urls" | "m3u";

type GetOptions = GlobalOptions & {
	quality: Quality;
	format: Format;
};

async function getCommand(
	stationToken: string,
	options: GetOptions,
): Promise<void> {
	const effect: Effect.Effect<void, PandoraError> = Effect.gen(function* () {
		const playlist = yield* withSession(
			(session) =>
				Client.getPlaylistWithQuality(session, stationToken, options.quality),
			{ verbose: options.verbose },
		);

		const outputOpts: OutputOptions = { json: options.json };
		const qualityInfo = QUALITY_INFO[options.quality];

		// Extract URL using quality abstraction
		const getUrl = (item: (typeof playlist.items)[0]): string | undefined => {
			return getAudioUrl(item, options.quality);
		};

		// Handle different output formats
		if (options.format === "urls") {
			const entries = playlist.items
				.map((item) => ({
					duration: -1,
					title: `${item.artistName} - ${item.songName}`,
					url: getUrl(item) || "",
				}))
				.filter((e) => e.url);
			console.log(generateURLList(entries));
			return;
		}

		if (options.format === "m3u") {
			const entries = playlist.items
				.map((item) => ({
					duration: -1,
					title: `${item.artistName} - ${item.songName}`,
					url: getUrl(item) || "",
				}))
				.filter((e) => e.url);
			console.log(generateM3U(entries));
			return;
		}

		// Full format (default)
		if (options.json) {
			console.log(JSON.stringify({ success: true, data: playlist }, null, 2));
			return;
		}

		const rows = playlist.items.map((item) => ({
			Artist: item.artistName,
			Song: item.songName,
			Album: item.albumName || "—",
			URL: getUrl(item) || "—",
		}));

		console.log(
			formatTable(["Artist", "Song", "Album", "URL"], rows, outputOpts),
		);
		console.log(
			pc.dim(
				`\nTotal tracks: ${playlist.items.length} | Quality: ${qualityInfo.description}`,
			),
		);
		console.log(pc.dim(`Note: URLs expire in approximately 30 minutes`));
	});

	await runEffect(effect, { verbose: options.verbose, json: options.json });
}

async function skipCommand(options: GlobalOptions): Promise<void> {
	console.log(
		formatError(
			{
				code: "NOT_IMPLEMENTED",
				message: "Track skipping not yet implemented",
			},
			{ json: options.json },
		),
	);
	process.exit(1);
}

async function rateCommand(
	trackToken: string,
	rating: string,
	options: GlobalOptions,
): Promise<void> {
	console.log(
		formatError(
			{ code: "NOT_IMPLEMENTED", message: "Track rating not yet implemented" },
			{ json: options.json },
		),
	);
	process.exit(1);
}

export function registerPlaylistCommands(program: Command): void {
	const playlist = program.command("playlist").description("Playlist commands");

	playlist
		.command("get <station-token>")
		.description("Get playlist for a station")
		.option(
			"-Q, --quality <level>",
			"Audio quality: high (128kbps MP3), medium (64kbps AAC+), low (32kbps AAC+)",
			"high",
		)
		.option("-f, --format <fmt>", "Output format: full, urls, m3u", "full")
		.action(
			async (
				stationToken: string,
				cmdOpts: { quality: string; format: string },
			) => {
				const globalOpts = program.opts<GlobalOptions>();
				const opts: GetOptions = {
					...globalOpts,
					quality: cmdOpts.quality as Quality,
					format: cmdOpts.format as Format,
				};
				await getCommand(stationToken, opts);
			},
		);

	playlist
		.command("skip")
		.description("Skip current track")
		.action(async () => {
			const opts = program.opts<GlobalOptions>();
			await skipCommand(opts);
		});

	playlist
		.command("rate <track-token> <rating>")
		.description("Rate a track (rating: up|down)")
		.action(async (trackToken: string, rating: string) => {
			const opts = program.opts<GlobalOptions>();
			await rateCommand(trackToken, rating, opts);
		});
}
