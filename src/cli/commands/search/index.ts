import { Effect } from "effect";
import { Command } from "commander";
import pc from "picocolors";
import { search } from "../../../client.js";
import type {
	MusicSearchResponse,
	SearchArtist,
	SearchSong,
	SearchGenreStation,
} from "../../../types/api.js";
import type { PandoraError } from "../../../types/errors.js";
import { runEffect } from "../../errors/handler.js";
import { formatTable, type OutputOptions } from "../../output/formatter.js";
import { withSession } from "../../utils/withSession.js";
import type { GlobalOptions } from "../../index.js";

type SearchType = "artist" | "song" | "genre" | "all";

type SearchOptions = {
	readonly type: SearchType;
};

type SearchCommandOptions = GlobalOptions & SearchOptions;

type SearchResultRow = {
	readonly NAME: string;
	readonly TYPE: string;
	readonly TOKEN: string;
};

function formatSearchResults(
	response: MusicSearchResponse,
	options: SearchCommandOptions,
): SearchResultRow[] {
	const results: SearchResultRow[] = [];

	if (
		(options.type === "all" || options.type === "artist") &&
		response.artists
	) {
		results.push(
			...response.artists.map((artist: SearchArtist) => ({
				NAME: artist.artistName,
				TYPE: "Artist",
				TOKEN: artist.musicToken,
			})),
		);
	}

	if ((options.type === "all" || options.type === "song") && response.songs) {
		results.push(
			...response.songs.map((song: SearchSong) => ({
				NAME: `${song.songName} - ${song.artistName}`,
				TYPE: "Song",
				TOKEN: song.musicToken,
			})),
		);
	}

	if (
		(options.type === "all" || options.type === "genre") &&
		response.genreStations
	) {
		results.push(
			...response.genreStations.map((genre: SearchGenreStation) => ({
				NAME: genre.stationName,
				TYPE: "Genre",
				TOKEN: genre.musicToken,
			})),
		);
	}

	return results;
}

function formatSearchTable(
	results: SearchResultRow[],
	query: string,
	options: OutputOptions,
): string {
	if (options.json) {
		const response = {
			success: true,
			data: {
				query,
				results,
				count: results.length,
			},
		};
		return JSON.stringify(response, null, 2);
	}

	if (results.length === 0) {
		return pc.dim(`No results found for "${query}"`);
	}

	const headers = ["NAME", "TYPE", "TOKEN"];
	const table = formatTable(headers, results, { json: false });

	const title = pc.bold(`Search Results for "${query}"`);
	const separator = "=".repeat(25);
	const pluralSuffix = results.length === 1 ? "" : "s";
	const footer = `\nTotal: ${results.length} result${pluralSuffix}`;

	return `${title}\n${separator}\n\n${table}\n${footer}`;
}

type SearchResult = {
	readonly results: SearchResultRow[];
	readonly query: string;
	readonly count: number;
};

export function registerSearchCommand(program: Command): void {
	program
		.command("search")
		.description("Search for music, artists, and genre stations")
		.argument("<query>", "Search query")
		.option(
			"-t, --type <type>",
			"Filter results by type: artist, song, genre, or all",
			"all",
		)
		.action(async (query: string, options: SearchOptions, command: Command) => {
			const globalOpts: GlobalOptions =
				command.optsWithGlobals() as GlobalOptions;

			const allOpts: SearchCommandOptions = {
				...globalOpts,
				...options,
			};

			const validTypes: SearchType[] = ["artist", "song", "genre", "all"];
			if (!validTypes.includes(allOpts.type)) {
				const typeList = validTypes.join(", ");
				console.error(
					pc.red(`Invalid type: ${allOpts.type}. Must be one of: ${typeList}`),
				);
				process.exit(2);
			}

			const effect: Effect.Effect<SearchResult, PandoraError> = Effect.gen(
				function* () {
					const response: MusicSearchResponse = yield* withSession(
						(session) => search(session, query),
						{ verbose: allOpts.verbose },
					);

					const results = formatSearchResults(response, allOpts);

					return {
						results,
						query,
						count: results.length,
					};
				},
			);

			const result = await runEffect(effect, {
				verbose: allOpts.verbose,
				json: allOpts.json,
			});

			const output = formatSearchTable(result.results, result.query, {
				json: allOpts.json,
			});

			console.log(output);
		});
}
