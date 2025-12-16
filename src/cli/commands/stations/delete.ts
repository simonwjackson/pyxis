import { Effect } from "effect";
import { Command } from "commander";
import pc from "picocolors";
import * as readline from "readline";
import { deleteStation, getStationList } from "../../../client.js";
import type { StationListResponse } from "../../../types/api.js";
import type { PandoraError } from "../../../types/errors.js";
import { SessionError } from "../../../types/errors.js";
import { runEffect } from "../../errors/handler.js";
import { ensureSession } from "../../utils/withSession.js";
import { findStationOrFail } from "../utils/findStation.js";
import type { GlobalOptions } from "../../index.js";

type DeleteOptions = {
	readonly yes?: boolean;
};

type DeleteCommandOptions = GlobalOptions & DeleteOptions;

function promptConfirmation(stationName: string): Promise<boolean> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise((resolve) => {
		const warning = pc.yellow("⚠");
		const bold = pc.bold(stationName);
		rl.question(
			`${warning} Delete station "${bold}"? This cannot be undone. (y/N): `,
			(answer) => {
				rl.close();
				resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
			},
		);
	});
}

export function registerDeleteCommand(program: Command): void {
	program
		.command("delete <station-name>")
		.description("Delete a station")
		.option("-y, --yes", "Skip confirmation prompt")
		.action(
			async (stationName: string, options: DeleteOptions, command: Command) => {
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

				const allOpts: DeleteCommandOptions = {
					...globalOpts,
					...options,
				};

				const effect: Effect.Effect<string, PandoraError> = Effect.gen(
					function* () {
						const session = yield* ensureSession({ verbose: allOpts.verbose });

						const stationListResponse: StationListResponse =
							yield* getStationList(session);
						const station = yield* findStationOrFail(
							stationListResponse.stations,
							stationName,
						);

						if (!allOpts.yes && !allOpts.json) {
							const confirmed = yield* Effect.promise(() =>
								promptConfirmation(station.stationName),
							);
							if (!confirmed) {
								return yield* Effect.fail(
									new SessionError({
										message: "Deletion cancelled",
									}),
								);
							}
						}

						yield* deleteStation(session, {
							stationToken: station.stationToken,
						});

						return station.stationName;
					},
				);

				const result = await runEffect(effect, {
					verbose: allOpts.verbose,
					json: allOpts.json,
				});

				if (allOpts.json) {
					const response = {
						success: true,
						data: {
							deleted: result,
						},
					};
					console.log(JSON.stringify(response, null, 2));
				} else {
					const checkmark = pc.green("✓");
					const stationNameBold = pc.bold(result);
					console.log(`${checkmark} Deleted station: ${stationNameBold}`);
				}
			},
		);
}
