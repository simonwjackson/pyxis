import { Effect } from "effect";
import { Command } from "commander";
import pc from "picocolors";
import { deleteArtistBookmark, deleteSongBookmark } from "../../../client.js";
import type { PandoraError } from "../../../types/errors.js";
import { runEffect } from "../../errors/handler.js";
import type { GlobalOptions } from "../../index.js";
import { ensureSession } from "../../utils/withSession.js";

type BookmarkType = "artist" | "song";

type DeleteOptions = {
	readonly type: BookmarkType;
};

type DeleteCommandOptions = GlobalOptions & DeleteOptions;

function capitalizeFirst(str: string): string {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatDeleteSuccess(
	bookmarkType: BookmarkType,
	bookmarkToken: string,
	options: { readonly json: boolean },
): string {
	if (options.json) {
		return JSON.stringify(
			{
				success: true,
				data: {
					bookmarkType,
					bookmarkToken,
					message: `${bookmarkType} bookmark deleted successfully`,
				},
			},
			null,
			2,
		);
	}

	return pc.green(
		`${capitalizeFirst(bookmarkType)} bookmark deleted successfully!`,
	);
}

export function registerDeleteCommand(program: Command): void {
	program
		.command("delete")
		.description("Delete a bookmark")
		.argument("<bookmark-token>", "Bookmark token to delete")
		.requiredOption("-t, --type <type>", "Bookmark type: artist or song")
		.action(
			async (
				bookmarkToken: string,
				options: DeleteOptions,
				command: Command,
			) => {
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

				const validTypes: BookmarkType[] = ["artist", "song"];
				if (!validTypes.includes(allOpts.type)) {
					console.error(
						pc.red(
							"Invalid bookmark type: " +
								allOpts.type +
								". Must be one of: " +
								validTypes.join(", "),
						),
					);
					process.exit(2);
				}

				const effect: Effect.Effect<
					Record<string, never>,
					PandoraError
				> = Effect.gen(function* () {
					const session = yield* ensureSession({ verbose: allOpts.verbose });

					if (allOpts.type === "artist") {
						yield* deleteArtistBookmark(session, { bookmarkToken });
					} else {
						yield* deleteSongBookmark(session, { bookmarkToken });
					}

					return {};
				});

				await runEffect(effect, {
					verbose: allOpts.verbose,
					json: allOpts.json,
				});

				const output = formatDeleteSuccess(allOpts.type, bookmarkToken, {
					json: allOpts.json,
				});
				console.log(output);
			},
		);
}
