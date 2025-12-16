import { Effect } from "effect";
import { Command } from "commander";
import pc from "picocolors";
import { getStationList, addMusic, deleteMusic } from "../../../client.js";
import type {
	Station,
	StationListResponse,
	AddMusicResponse,
} from "../../../types/api.js";
import type { PandoraError } from "../../../types/errors.js";
import { SessionError } from "../../../types/errors.js";
import { runEffect } from "../../errors/handler.js";
import { ensureSession, withSession } from "../../utils/withSession.js";
import type { GlobalOptions } from "../../index.js";

type SeedCommandOptions = GlobalOptions;

function findStationByName(
	stations: readonly Station[],
	stationName: string,
): Station | undefined {
	const lowerName = stationName.toLowerCase();
	return stations.find(
		(station) => station.stationName.toLowerCase() === lowerName,
	);
}

function formatAddMusicResponse(
	response: AddMusicResponse,
	options: { json: boolean },
): string {
	if (options.json) {
		const result = {
			success: true,
			data: response,
		};
		return JSON.stringify(result, null, 2);
	}

	let output = pc.green("Seed added successfully\n");
	output += "\n" + pc.bold("Seed ID") + ": " + response.seedId;

	if (response.artistName && response.songName) {
		output +=
			"\n" +
			pc.bold("Song") +
			': "' +
			response.songName +
			'" by ' +
			response.artistName;
	} else if (response.artistName) {
		output += "\n" + pc.bold("Artist") + ": " + response.artistName;
	}

	return output;
}

function formatDeleteMusicResponse(options: { json: boolean }): string {
	if (options.json) {
		const result = {
			success: true,
			message: "Seed removed successfully",
		};
		return JSON.stringify(result, null, 2);
	}

	return pc.green("Seed removed successfully");
}

function registerAddCommand(program: Command): void {
	program
		.command("add <station-name> <music-token>")
		.description("Add an artist or song seed to a station")
		.action(
			async (stationName: string, musicToken: string, command: Command) => {
				const parentCommand = command.parent as Command & {
					parent?: Command & {
						parent?: Command & { optsWithGlobals?: () => GlobalOptions };
					};
				};
				const globalOpts: GlobalOptions =
					parentCommand.parent?.parent?.optsWithGlobals?.() ?? {
						json: false,
						cache: true,
						verbose: false,
						quiet: false,
					};

				const effect: Effect.Effect<AddMusicResponse, PandoraError> =
					Effect.gen(function* () {
						const session = yield* ensureSession({
							verbose: globalOpts.verbose,
						});

						// Get station list to find the station token
						const stationListResponse: StationListResponse =
							yield* getStationList(session);
						const station = findStationByName(
							stationListResponse.stations,
							stationName,
						);

						if (!station) {
							return yield* Effect.fail(
								new SessionError({
									message:
										'Station "' +
										stationName +
										"\" not found. Use 'pandora stations list' to see available stations.",
								}),
							);
						}

						// Add the music seed
						const response: AddMusicResponse = yield* addMusic(session, {
							stationToken: station.stationToken,
							musicToken,
						});

						return response;
					});

				const result = await runEffect(effect, {
					verbose: globalOpts.verbose,
					json: globalOpts.json,
				});

				const output = formatAddMusicResponse(result, {
					json: globalOpts.json,
				});

				console.log(output);
			},
		);
}

function registerRemoveCommand(program: Command): void {
	program
		.command("remove <seed-id>")
		.description("Remove a seed from a station")
		.action(async (seedId: string, command: Command) => {
			const parentCommand = command.parent as Command & {
				parent?: Command & {
					parent?: Command & { optsWithGlobals?: () => GlobalOptions };
				};
			};
			const globalOpts: GlobalOptions =
				parentCommand.parent?.parent?.optsWithGlobals?.() ?? {
					json: false,
					cache: true,
					verbose: false,
					quiet: false,
				};

			const effect: Effect.Effect<
				Record<string, never>,
				PandoraError
			> = Effect.gen(function* () {
				const response: Record<string, never> = yield* withSession(
					(session) => deleteMusic(session, { seedId }),
					{ verbose: globalOpts.verbose },
				);

				return response;
			});

			await runEffect(effect, {
				verbose: globalOpts.verbose,
				json: globalOpts.json,
			});

			const output = formatDeleteMusicResponse({
				json: globalOpts.json,
			});

			console.log(output);
		});
}

export function registerSeedCommand(program: Command): void {
	const seed = program
		.command("seed")
		.description("Manage station seeds (add/remove artists and songs)");

	registerAddCommand(seed);
	registerRemoveCommand(seed);
}
