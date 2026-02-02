import { createFileRoute } from "@tanstack/react-router";
import { User, Music, Bookmark, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/web/shared/lib/trpc";
import { Spinner } from "@/web/shared/ui/spinner";
import { Button } from "@/web/shared/ui/button";

function BookmarksPage() {
	const bookmarksQuery = trpc.library.bookmarks.useQuery();
	const utils = trpc.useUtils();

	const removeBookmark = trpc.library.removeBookmark.useMutation({
		onSuccess: (_data, variables) => {
			utils.library.bookmarks.invalidate();
			toast.success(
				variables.type === "artist"
					? "Artist bookmark removed"
					: "Song bookmark removed",
			)
		},
	})

	const createStation = trpc.radio.create.useMutation({
		onSuccess: () => {
			utils.radio.list.invalidate();
			toast.success("Station created");
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
		<div className="flex-1 p-4 space-y-6">
			<h2 className="text-lg font-semibold">Bookmarks</h2>

			{artists.length > 0 && (
				<section>
					<h3 className="text-sm font-medium text-[var(--color-text-muted)] mb-2">
						Artists
					</h3>
					<ul className="space-y-1">
						{artists.map((a) => (
							<li
								key={a.bookmarkToken}
								className="flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--color-bg-highlight)] group"
							>
								<div className="w-10 h-10 rounded-full bg-[var(--color-bg-highlight)] flex items-center justify-center shrink-0">
									<User className="w-5 h-5 text-[var(--color-text-muted)]" />
								</div>
								<span className="flex-1 text-[var(--color-text)]">
									{a.artistName}
								</span>
								<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
									<Button
										variant="ghost"
										size="icon"
										className="text-[var(--color-text-muted)] hover:text-emerald-400"
										onClick={() =>
											createStation.mutate({
												musicToken: a.musicToken,
												musicType: "artist",
											})
										}
										title="Create station"
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
					<h3 className="text-sm font-medium text-[var(--color-text-muted)] mb-2">
						Songs
					</h3>
					<ul className="space-y-1">
						{songs.map((s) => (
							<li
								key={s.bookmarkToken}
								className="flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--color-bg-highlight)] group"
							>
								<div className="w-10 h-10 rounded bg-[var(--color-bg-highlight)] flex items-center justify-center shrink-0">
									<Music className="w-5 h-5 text-[var(--color-text-muted)]" />
								</div>
								<div className="flex-1 min-w-0">
									<p className="text-[var(--color-text)] truncate">
										{s.songName}
									</p>
									<p className="text-xs text-[var(--color-text-dim)]">
										{s.artistName}
									</p>
								</div>
								<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
									<Button
										variant="ghost"
										size="icon"
										className="text-[var(--color-text-muted)] hover:text-emerald-400"
										onClick={() =>
											createStation.mutate({
												musicToken: s.musicToken,
												musicType: "song",
											})
										}
										title="Create station"
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
				<div className="text-center py-12 text-[var(--color-text-dim)]">
					<Bookmark className="w-12 h-12 mx-auto mb-4 text-[var(--color-text-dim)]" />
					<p>No bookmarks yet.</p>
					<p className="text-sm mt-1">
						Bookmark artists and songs from the now-playing view.
					</p>
				</div>
			)}
		</div>
	)
}

export const Route = createFileRoute("/bookmarks/")({
	component: BookmarksPage,
});
