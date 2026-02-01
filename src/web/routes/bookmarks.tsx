import { User, Music, Bookmark, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";
import { Spinner } from "../components/ui/spinner";
import { Button } from "../components/ui/button";

export function BookmarksPage() {
	const bookmarksQuery = trpc.bookmarks.list.useQuery();
	const utils = trpc.useUtils();

	const deleteArtist = trpc.bookmarks.deleteArtist.useMutation({
		onSuccess: () => {
			utils.bookmarks.list.invalidate();
			toast.success("Artist bookmark removed");
		},
	});

	const deleteSong = trpc.bookmarks.deleteSong.useMutation({
		onSuccess: () => {
			utils.bookmarks.list.invalidate();
			toast.success("Song bookmark removed");
		},
	});

	if (bookmarksQuery.isLoading) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<Spinner />
			</div>
		);
	}

	const artists = bookmarksQuery.data?.artists ?? [];
	const songs = bookmarksQuery.data?.songs ?? [];

	return (
		<div className="flex-1 p-4 space-y-6">
			<h2 className="text-lg font-semibold">Bookmarks</h2>

			{artists.length > 0 && (
				<section>
					<h3 className="text-sm font-medium text-zinc-400 mb-2">
						Artists
					</h3>
					<ul className="space-y-1">
						{artists.map((a) => (
							<li
								key={a.bookmarkToken}
								className="flex items-center gap-3 p-3 rounded-lg hover:bg-zinc-800 group"
							>
								<div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center shrink-0">
									<User className="w-5 h-5 text-zinc-400" />
								</div>
								<span className="flex-1 text-zinc-200">
									{a.artistName}
								</span>
								<Button
									variant="ghost"
									size="icon"
									className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-red-400"
									onClick={() =>
										deleteArtist.mutate({
											bookmarkToken: a.bookmarkToken,
										})
									}
								>
									<Trash2 className="w-4 h-4" />
								</Button>
							</li>
						))}
					</ul>
				</section>
			)}

			{songs.length > 0 && (
				<section>
					<h3 className="text-sm font-medium text-zinc-400 mb-2">
						Songs
					</h3>
					<ul className="space-y-1">
						{songs.map((s) => (
							<li
								key={s.bookmarkToken}
								className="flex items-center gap-3 p-3 rounded-lg hover:bg-zinc-800 group"
							>
								<div className="w-10 h-10 rounded bg-zinc-700 flex items-center justify-center shrink-0">
									<Music className="w-5 h-5 text-zinc-400" />
								</div>
								<div className="flex-1 min-w-0">
									<p className="text-zinc-200 truncate">
										{s.songName}
									</p>
									<p className="text-xs text-zinc-500">
										{s.artistName}
									</p>
								</div>
								<Button
									variant="ghost"
									size="icon"
									className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-red-400"
									onClick={() =>
										deleteSong.mutate({
											bookmarkToken: s.bookmarkToken,
										})
									}
								>
									<Trash2 className="w-4 h-4" />
								</Button>
							</li>
						))}
					</ul>
				</section>
			)}

			{artists.length === 0 && songs.length === 0 && (
				<div className="text-center py-12 text-zinc-500">
					<Bookmark className="w-12 h-12 mx-auto mb-4 text-zinc-600" />
					<p>No bookmarks yet.</p>
					<p className="text-sm mt-1">
						Bookmark artists and songs from the now-playing view.
					</p>
				</div>
			)}
		</div>
	);
}
