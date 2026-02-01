import { trpc } from "../lib/trpc";
import { Spinner } from "../components/ui/spinner";
import { Button } from "../components/ui/button";

export function BookmarksPage() {
	const bookmarksQuery = trpc.bookmarks.list.useQuery();
	const utils = trpc.useUtils();

	const deleteArtist = trpc.bookmarks.deleteArtist.useMutation({
		onSuccess: () => utils.bookmarks.list.invalidate(),
	});

	const deleteSong = trpc.bookmarks.deleteSong.useMutation({
		onSuccess: () => utils.bookmarks.list.invalidate(),
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
					<h3 className="text-sm font-semibold text-zinc-400 uppercase mb-2">
						Artists
					</h3>
					<ul className="space-y-1">
						{artists.map((a) => (
							<li
								key={a.bookmarkToken}
								className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-zinc-800"
							>
								<span className="text-zinc-200">{a.artistName}</span>
								<Button
									variant="ghost"
									size="sm"
									onClick={() =>
										deleteArtist.mutate({
											bookmarkToken: a.bookmarkToken,
										})
									}
								>
									Remove
								</Button>
							</li>
						))}
					</ul>
				</section>
			)}

			{songs.length > 0 && (
				<section>
					<h3 className="text-sm font-semibold text-zinc-400 uppercase mb-2">
						Songs
					</h3>
					<ul className="space-y-1">
						{songs.map((s) => (
							<li
								key={s.bookmarkToken}
								className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-zinc-800"
							>
								<div>
									<p className="text-zinc-200">{s.songName}</p>
									<p className="text-xs text-zinc-500">{s.artistName}</p>
								</div>
								<Button
									variant="ghost"
									size="sm"
									onClick={() =>
										deleteSong.mutate({
											bookmarkToken: s.bookmarkToken,
										})
									}
								>
									Remove
								</Button>
							</li>
						))}
					</ul>
				</section>
			)}

			{artists.length === 0 && songs.length === 0 && (
				<p className="text-zinc-500 text-sm">No bookmarks yet.</p>
			)}
		</div>
	);
}
