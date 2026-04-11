/**
 * @module BookmarksPage
 * Page for viewing and managing bookmarked artists and songs.
 */

import { User, Music, Bookmark, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/web/shared/lib/trpc";
import { Spinner } from "@/web/shared/ui/spinner";
import { Button } from "@/web/shared/ui/button";

/**
 * Bookmarks page displaying user's saved artists and songs.
 * Allows removing bookmarks and creating stations from bookmarked items.
 */
export function BookmarksPage() {
	const bookmarksQuery = trpc.library.bookmarks.useQuery();
	const utils = trpc.useUtils();

	const removeBookmark = trpc.library.removeBookmark.useMutation({
		onSuccess: (_data, variables) => {
			utils.library.bookmarks.invalidate();
			toast.success(
				variables.type === "artist"
					? "artist bookmark removed"
					: "song bookmark removed",
			)
		},
	})

	const createStation = trpc.radio.create.useMutation({
		onSuccess: () => {
			utils.radio.list.invalidate();
			toast.success("station created");
		},
		onError: (err) => {
			toast.error(`Failed to create station: ${err.message}`);
		},
	})

	if (bookmarksQuery.isLoading) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<Spinner />
			</div>
		)
	}

	const artists = bookmarksQuery.data?.artists ?? [];
	const songs = bookmarksQuery.data?.songs ?? [];

	return (
		<div className="flex-1 px-4 sm:px-8 py-10 space-y-8">
			<h2 className="zune-display zune-page-title text-[var(--color-text)]">bookmarks</h2>

			{artists.length > 0 && (
				<section>
					<h3 className="zune-label text-[var(--color-text-muted)] mb-2">
						artists
					</h3>
					<ul className="space-y-1">
						{artists.map((a) => (
							<li
								key={a.bookmarkToken}
								className="flex items-center gap-3 p-3 hover:bg-[var(--color-bg-highlight)] group"
							>
								<div className="w-10 h-10 bg-[var(--color-bg-highlight)] flex items-center justify-center shrink-0">
									<User className="w-5 h-5 text-[var(--color-text-muted)]" />
								</div>
								<span className="flex-1 zune-list-title text-[var(--color-text)]">
									{a.artistName}
								</span>
								<div className="flex items-center gap-1 max-md:opacity-100 opacity-0 group-hover:opacity-100 transition-opacity">
									<Button
										variant="ghost"
										size="icon"
										className="text-[var(--color-text-muted)] hover:text-[var(--color-success)]"
										onClick={() =>
											createStation.mutate({
												musicToken: a.musicToken,
												musicType: "artist",
											})
										}
										title="Create station"
										aria-label={`Create station from ${a.artistName}`}
									>
										<Plus className="w-4 h-4" />
									</Button>
									<Button
										variant="ghost"
										size="icon"
										className="text-[var(--color-text-muted)] hover:text-[var(--color-error)]"
										onClick={() =>
											removeBookmark.mutate({
												bookmarkToken: a.bookmarkToken,
												type: "artist",
											})
										}
										title="Remove bookmark"
										aria-label={`Remove ${a.artistName} bookmark`}
									>
										<Trash2 className="w-4 h-4" />
									</Button>
								</div>
							</li>
						))}
					</ul>
				</section>
			)}

			{songs.length > 0 && (
				<section>
					<h3 className="zune-label text-[var(--color-text-muted)] mb-2">
						songs
					</h3>
					<ul className="space-y-1">
						{songs.map((s) => (
							<li
								key={s.bookmarkToken}
								className="flex items-center gap-3 p-3 hover:bg-[var(--color-bg-highlight)] group"
							>
								<div className="w-10 h-10 bg-[var(--color-bg-highlight)] flex items-center justify-center shrink-0">
									<Music className="w-5 h-5 text-[var(--color-text-muted)]" />
								</div>
								<div className="flex-1 min-w-0">
									<p className="zune-list-title text-[var(--color-text)] truncate">
										{s.songName}
									</p>
									<p className="zune-eyebrow text-[var(--color-text-dim)]">
										{s.artistName}
									</p>
								</div>
								<div className="flex items-center gap-1 max-md:opacity-100 opacity-0 group-hover:opacity-100 transition-opacity">
									<Button
										variant="ghost"
										size="icon"
										className="text-[var(--color-text-muted)] hover:text-[var(--color-success)]"
										onClick={() =>
											createStation.mutate({
												musicToken: s.musicToken,
												musicType: "song",
											})
										}
										title="Create station"
										aria-label={`Create station from ${s.songName}`}
									>
										<Plus className="w-4 h-4" />
									</Button>
									<Button
										variant="ghost"
										size="icon"
										className="text-[var(--color-text-muted)] hover:text-[var(--color-error)]"
										onClick={() =>
											removeBookmark.mutate({
												bookmarkToken: s.bookmarkToken,
												type: "song",
											})
										}
										title="Remove bookmark"
										aria-label={`Remove ${s.songName} bookmark`}
									>
										<Trash2 className="w-4 h-4" />
									</Button>
								</div>
							</li>
						))}
					</ul>
				</section>
			)}

			{artists.length === 0 && songs.length === 0 && (
				<div className="py-16 text-[var(--color-text-dim)]">
					<p className="zune-display text-4xl text-[var(--color-text-dim)]/40 mb-4">no bookmarks</p>
					<p className="text-sm">
						bookmark artists and songs while playing.
					</p>
				</div>
			)}
		</div>
	)
}
