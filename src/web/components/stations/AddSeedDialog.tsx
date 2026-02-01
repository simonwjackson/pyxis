import { useState, useEffect, useRef } from "react";
import { Search, User, Music, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "../../lib/trpc";

type AddSeedDialogProps = {
	readonly stationToken: string;
	readonly onClose: () => void;
};

export function AddSeedDialog({ stationToken, onClose }: AddSeedDialogProps) {
	const [query, setQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	const utils = trpc.useUtils();

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedQuery(query.trim());
		}, 300);
		return () => clearTimeout(timer);
	}, [query]);

	const searchQuery = trpc.search.search.useQuery(
		{ searchText: debouncedQuery },
		{ enabled: debouncedQuery.length > 0 },
	);

	const addMutation = trpc.stations.addMusic.useMutation({
		onSuccess(data) {
			utils.stations.getStation.invalidate({ stationToken });
			const name = data.songName ?? data.artistName ?? "Seed";
			toast.success(`Added "${name}" as a seed`);
		},
		onError(err) {
			toast.error(`Failed to add seed: ${err.message}`);
		},
	});

	const handleAdd = (musicToken: string) => {
		addMutation.mutate({ stationToken, musicToken });
	};

	const artists = searchQuery.data?.artists ?? [];
	const songs = searchQuery.data?.songs ?? [];
	const hasResults = artists.length > 0 || songs.length > 0;
	const isSearching = searchQuery.isFetching;
	const showEmpty =
		debouncedQuery.length > 0 && !isSearching && !hasResults;

	return (
		<div
			className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50"
			onClick={onClose}
			onKeyDown={(e) => {
				if (e.key === "Escape") onClose();
			}}
		>
			<div
				className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md max-h-[70vh] flex flex-col shadow-2xl"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={() => {}}
			>
				<div className="p-4 border-b border-zinc-800 shrink-0">
					<h2 className="text-lg font-semibold text-zinc-100 mb-3">
						Add Seed
					</h2>
					<div className="relative">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
						<input
							ref={inputRef}
							type="text"
							placeholder="Search artists or songs..."
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							className="w-full pl-9 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
						/>
					</div>
				</div>

				<div className="flex-1 overflow-y-auto p-2">
					{isSearching && (
						<div className="py-8 text-center">
							<Loader2 className="w-5 h-5 animate-spin mx-auto text-zinc-500" />
						</div>
					)}

					{!isSearching && hasResults && (
						<>
							{artists.length > 0 && (
								<div className="mb-2">
									<p className="text-xs text-zinc-500 px-3 py-1">
										Artists
									</p>
									{artists.map((artist) => (
										<button
											key={artist.musicToken}
											type="button"
											onClick={() =>
												handleAdd(artist.musicToken)
											}
											disabled={addMutation.isPending}
											className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-zinc-800 text-left disabled:opacity-50"
										>
											<div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center shrink-0">
												<User className="w-4 h-4 text-zinc-400" />
											</div>
											<span className="text-sm text-zinc-200 truncate">
												{artist.artistName}
											</span>
											<span className="ml-auto text-xs text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded shrink-0">
												Add
											</span>
										</button>
									))}
								</div>
							)}

							{songs.length > 0 && (
								<div>
									<p className="text-xs text-zinc-500 px-3 py-1">
										Songs
									</p>
									{songs.map((song) => (
										<button
											key={song.musicToken}
											type="button"
											onClick={() =>
												handleAdd(song.musicToken)
											}
											disabled={addMutation.isPending}
											className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-zinc-800 text-left disabled:opacity-50"
										>
											<div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center shrink-0">
												<Music className="w-4 h-4 text-zinc-400" />
											</div>
											<div className="flex-1 min-w-0">
												<p className="text-sm text-zinc-200 truncate">
													{song.songName}
												</p>
												<p className="text-xs text-zinc-500 truncate">
													{song.artistName}
												</p>
											</div>
											<span className="ml-auto text-xs text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded shrink-0">
												Add
											</span>
										</button>
									))}
								</div>
							)}
						</>
					)}

					{showEmpty && (
						<div className="py-8 text-center text-zinc-500 text-sm">
							No results found for &ldquo;{debouncedQuery}&rdquo;
						</div>
					)}

					{debouncedQuery.length === 0 && !isSearching && (
						<div className="py-8 text-center text-zinc-500 text-sm">
							Search for artists or songs to add as seeds
						</div>
					)}
				</div>

				<div className="p-4 border-t border-zinc-800 shrink-0">
					<button
						type="button"
						onClick={onClose}
						className="w-full px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800 rounded-lg"
					>
						Done
					</button>
				</div>
			</div>
		</div>
	);
}
