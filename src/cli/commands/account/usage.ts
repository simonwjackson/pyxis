import { Effect } from "effect";
import { Command } from "commander";
import pc from "picocolors";
import { getUsageInfo } from "../../../client.js";
import type { GetUsageInfoResponse } from "../../../types/api.js";
import type { PandoraError } from "../../../types/errors.js";
import { runEffect } from "../../errors/handler.js";
import type { OutputOptions } from "../../output/formatter.js";
import type { GlobalOptions } from "../../index.js";
import { withSession } from "../../utils/withSession.js";

function formatHours(minutes: number | undefined): string {
	if (minutes === undefined) {
		return pc.dim("(not set)");
	}
	const hours = Math.floor(minutes / 60);
	const mins = Math.floor(minutes % 60);
	return hours > 0 ? hours + "h " + mins + "m" : mins + "m";
}

function formatPercentage(percent: number | undefined): string {
	if (percent === undefined) {
		return pc.dim("(not set)");
	}
	return percent + "%";
}

function formatDate(timestamp: number | undefined): string {
	if (timestamp === undefined) {
		return pc.dim("(not set)");
	}
	return new Date(timestamp * 1000).toLocaleString();
}

function formatUsageOutput(
	usage: GetUsageInfoResponse,
	options: OutputOptions,
): string {
	if (options.json) {
		const response = {
			success: true,
			data: usage,
		};
		return JSON.stringify(response, null, 2);
	}

	const title = pc.bold("Account Usage Information");
	const separator = "=".repeat(26);

	const formatField = (label: string, value: string): string => {
		const paddedLabel = label.padEnd(35);
		return "  " + pc.bold(paddedLabel) + " " + value;
	};

	const formatBoolean = (label: string, value: boolean | undefined): string => {
		if (value === undefined) {
			return formatField(label, pc.dim("(not set)"));
		}
		const displayValue = value ? pc.green("Yes") : pc.red("No");
		return formatField(label, displayValue);
	};

	const monthlyUsage = formatHours(usage.accountMonthlyListening);
	const monthlyCap = formatHours(usage.monthlyCapHours);

	let usageBar = "";
	if (
		usage.accountMonthlyListening !== undefined &&
		usage.monthlyCapHours !== undefined &&
		usage.monthlyCapHours > 0
	) {
		const percent =
			(usage.accountMonthlyListening / usage.monthlyCapHours) * 100;
		const barLength = 30;
		const filled = Math.min(Math.floor((percent / 100) * barLength), barLength);
		const empty = barLength - filled;
		const bar = "█".repeat(filled) + "░".repeat(empty);
		const color = percent >= 80 ? pc.red : percent >= 50 ? pc.yellow : pc.green;
		usageBar = "\n  " + color(bar) + " " + percent.toFixed(1) + "%";
	}

	const lines = [
		title,
		separator,
		"",
		formatField("Monthly Listening", monthlyUsage),
		formatField("Monthly Cap", monthlyCap),
		usageBar,
		"",
		formatField(
			"Cap Warning Threshold",
			formatPercentage(usage.monthlyCapWarningPercent),
		),
		formatField(
			"Cap Warning Repeat",
			formatPercentage(usage.monthlyCapWarningRepeatPercent),
		),
		formatBoolean("Monthly Payer", usage.isMonthlyPayer),
		formatBoolean("Capped", usage.isCapped),
		formatField("Listening Timestamp", formatDate(usage.listeningTimestamp)),
		"",
	];

	return lines.join("\n");
}

export function registerUsageCommand(program: Command): void {
	program
		.command("usage")
		.description("Show account usage information")
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

			const effect: Effect.Effect<GetUsageInfoResponse, PandoraError> =
				Effect.gen(function* () {
					return yield* withSession((session) => getUsageInfo(session), {
						verbose: globalOpts.verbose,
					});
				});

			const result = await runEffect(effect, {
				verbose: globalOpts.verbose,
				json: globalOpts.json,
			});

			const output = formatUsageOutput(result, {
				json: globalOpts.json,
			});

			console.log(output);
		});
}
