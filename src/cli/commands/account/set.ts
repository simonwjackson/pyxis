import { Effect } from "effect";
import { Command } from "commander";
import pc from "picocolors";
import { changeSettings, setExplicitContentFilter } from "../../../client.js";
import type { PandoraError } from "../../../types/errors.js";
import { runEffect } from "../../errors/handler.js";
import type { GlobalOptions } from "../../index.js";
import { withSession } from "../../utils/withSession.js";

function parseBooleanArg(value: string): boolean {
	const lower = value.toLowerCase();
	if (lower === "on" || lower === "true" || lower === "yes" || lower === "1") {
		return true;
	}
	if (lower === "off" || lower === "false" || lower === "no" || lower === "0") {
		return false;
	}
	throw new Error(
		`Invalid boolean value: ${value}. Use: on/off, true/false, yes/no, or 1/0`,
	);
}

export function registerSetCommand(program: Command): void {
	const set = program.command("set").description("Modify account settings");

	set
		.command("explicit")
		.description("Toggle explicit content filter")
		.argument("<on|off>", "Enable or disable explicit content filter")
		.action(async (value: string, options, command: Command) => {
			const parentCommand = command.parent?.parent as Command & {
				parent?: Command & { optsWithGlobals?: () => GlobalOptions };
			};
			const globalOpts: GlobalOptions =
				parentCommand.parent?.optsWithGlobals?.() ?? {
					json: false,
					cache: true,
					verbose: false,
					quiet: false,
				};

			let enabled: boolean;
			try {
				enabled = parseBooleanArg(value);
			} catch (error) {
				if (error instanceof Error) {
					console.error(pc.red(error.message));
				}
				process.exit(2);
			}

			const effect: Effect.Effect<void, PandoraError> = Effect.gen(
				function* () {
					yield* withSession(
						(session) => setExplicitContentFilter(session, enabled),
						{ verbose: globalOpts.verbose },
					);

					if (!globalOpts.quiet) {
						if (globalOpts.json) {
							console.log(
								JSON.stringify(
									{
										success: true,
										setting: "explicitContentFilter",
										value: enabled,
									},
									null,
									2,
								),
							);
						} else {
							const status = enabled ? pc.green("enabled") : pc.red("disabled");
							console.log(`Explicit content filter ${status}`);
						}
					}
				},
			);

			await runEffect(effect, {
				verbose: globalOpts.verbose,
				json: globalOpts.json,
			});
		});

	set
		.command("private")
		.description("Toggle profile privacy")
		.argument("<on|off>", "Make profile private or public")
		.action(async (value: string, options, command: Command) => {
			const parentCommand = command.parent?.parent as Command & {
				parent?: Command & { optsWithGlobals?: () => GlobalOptions };
			};
			const globalOpts: GlobalOptions =
				parentCommand.parent?.optsWithGlobals?.() ?? {
					json: false,
					cache: true,
					verbose: false,
					quiet: false,
				};

			let isPrivate: boolean;
			try {
				isPrivate = parseBooleanArg(value);
			} catch (error) {
				if (error instanceof Error) {
					console.error(pc.red(error.message));
				}
				process.exit(2);
			}

			const effect: Effect.Effect<void, PandoraError> = Effect.gen(
				function* () {
					yield* withSession(
						(session) =>
							changeSettings(session, { isProfilePrivate: isPrivate }),
						{ verbose: globalOpts.verbose },
					);

					if (!globalOpts.quiet) {
						if (globalOpts.json) {
							console.log(
								JSON.stringify(
									{
										success: true,
										setting: "profilePrivacy",
										value: isPrivate,
									},
									null,
									2,
								),
							);
						} else {
							const status = isPrivate
								? pc.green("private")
								: pc.yellow("public");
							console.log(`Profile is now ${status}`);
						}
					}
				},
			);

			await runEffect(effect, {
				verbose: globalOpts.verbose,
				json: globalOpts.json,
			});
		});

	set
		.command("zip")
		.description("Set zip code")
		.argument("<zipcode>", "5-digit US zip code")
		.action(async (zipCode: string, options, command: Command) => {
			const parentCommand = command.parent?.parent as Command & {
				parent?: Command & { optsWithGlobals?: () => GlobalOptions };
			};
			const globalOpts: GlobalOptions =
				parentCommand.parent?.optsWithGlobals?.() ?? {
					json: false,
					cache: true,
					verbose: false,
					quiet: false,
				};

			if (!/^\d{5}$/.test(zipCode)) {
				console.error(pc.red("Error: Zip code must be a 5-digit number"));
				process.exit(2);
			}

			const effect: Effect.Effect<void, PandoraError> = Effect.gen(
				function* () {
					yield* withSession(
						(session) => changeSettings(session, { zipCode }),
						{ verbose: globalOpts.verbose },
					);

					if (!globalOpts.quiet) {
						if (globalOpts.json) {
							console.log(
								JSON.stringify(
									{
										success: true,
										setting: "zipCode",
										value: zipCode,
									},
									null,
									2,
								),
							);
						} else {
							console.log(pc.green(`Zip code updated to ${zipCode}`));
						}
					}
				},
			);

			await runEffect(effect, {
				verbose: globalOpts.verbose,
				json: globalOpts.json,
			});
		});
}
