import { Effect } from "effect";
import { Command } from "commander";
import pc from "picocolors";
import { getSettings } from "../../../client.js";
import type { GetSettingsResponse } from "../../../types/api.js";
import type { PandoraError } from "../../../types/errors.js";
import { runEffect } from "../../errors/handler.js";
import type { OutputOptions } from "../../output/formatter.js";
import type { GlobalOptions } from "../../index.js";
import { withSession } from "../../utils/withSession.js";

function formatSettingsOutput(
	settings: GetSettingsResponse,
	options: OutputOptions,
): string {
	if (options.json) {
		const response = {
			success: true,
			data: settings,
		};
		return JSON.stringify(response, null, 2);
	}

	const title = pc.bold("Account Settings");
	const separator = "=".repeat(17);

	const formatField = (label: string, value: unknown): string => {
		const displayValue =
			value !== undefined && value !== null
				? String(value)
				: pc.dim("(not set)");
		const paddedLabel = label.padEnd(35);
		return "  " + pc.bold(paddedLabel) + " " + displayValue;
	};

	const formatBoolean = (label: string, value: boolean | undefined): string => {
		if (value === undefined) {
			return formatField(label, undefined);
		}
		const displayValue = value ? pc.green("Yes") : pc.red("No");
		const paddedLabel = label.padEnd(35);
		return "  " + pc.bold(paddedLabel) + " " + displayValue;
	};

	const lines = [
		title,
		separator,
		"",
		formatField("Username", settings.username),
		formatField("Gender", settings.gender),
		formatField("Birth Year", settings.birthYear),
		formatField("Zip Code", settings.zipCode),
		formatBoolean(
			"Explicit Content Filter",
			settings.isExplicitContentFilterEnabled,
		),
		formatBoolean("Profile Private", settings.isProfilePrivate),
		formatBoolean("Email Opt-In", settings.emailOptIn),
		"",
	];

	return lines.join("\n");
}

export function registerSettingsCommand(program: Command): void {
	program
		.command("settings")
		.description("Show account settings")
		.action(async (options, command: Command) => {
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

			const effect: Effect.Effect<GetSettingsResponse, PandoraError> =
				Effect.gen(function* () {
					return yield* withSession((session) => getSettings(session), {
						verbose: globalOpts.verbose,
					});
				});

			const result = await runEffect(effect, {
				verbose: globalOpts.verbose,
				json: globalOpts.json,
			});

			const output = formatSettingsOutput(result, {
				json: globalOpts.json,
			});

			console.log(output);
		});
}
