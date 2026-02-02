import { useState, useEffect, useRef } from "react";
import { Search, User, Music, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "../../lib/trpc";

type AddSeedDialogProps = {
	readonly radioId: string;
	readonly onClose: () => void;
};

export function AddSeedDialog({ radioId, onClose }: AddSeedDialogProps) {
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

	const addMutation = trpc.radio.addSeed.useMutation({
		onSuccess(data) {
			utils.radio.getStation.invalidate({ id: radioId });
			const name = data.songName ?? data.artistName ?? "Seed";
			toast.success(`Added "${name}" as a seed`);
		},
		onError(err) {
			toast.error(`Failed to add seed: ${err.message}`);
		},
	});

	const handleAdd = (musicToken: string) => {
		addMutation.mutate({ radioId, musicToken });
	};

	const artists = searchQuery.data?.artists ?? [];
	const songs = searchQuery.data?.songs ?? [];
	const hasResults = artists.length > 0 || songs.length > 0;

	return (
		<div
			className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50"
			onClick={onClose}
			onKeyDown={(e) => {
				if (e.key === "Escape") onClose();
			}}
		>
			<div
				className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl w-full max-w-md max-h-[70vh] flex flex-col shadow-2xl"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={() => {}}
			>
				<div className="p-4 border-b border-[var(--color-border)] shrink-0">
					<h2 className="text-lg font-semibold text-[var(--color-text)] mb-3">
						Add Seed
					</h2>
					<div className="relative">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-dim)]" />
						<input
							ref={inputRef}
							type="text"
							placeholder="Search artists or songs..."
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							className="w-full pl-9 pr-4 py-2 bg-[var(--color-bg-highlight)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-active)]"
						/>
					</div>
				</div>

				<div className="flex-1 overflow-y-auto p-2">
					{searchQuery.isFetching ? (
						<SearchingView />
					) : hasResults ? (
						<ResultsView
							artists={artists}
							songs={songs}
							isPending={addMutation.isPending}
							onAdd={handleAdd}
						/>
					) : debouncedQuery.length > 0 ? (
						<EmptyView query={debouncedQuery} />
					) : (
						<PromptView />
					)}
				</div>

				<div className="p-4 border-t border-[var(--color-border)] shrink-0">
					<button
						type="button"
						onClick={onClose}
						className="w-full px-4 py-2 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-bg-highlight)] rounded-lg"
					>
						Done
					</button>
				</div>
			</div>
		</div>
	);
}

type Artist = { readonly musicToken: string; readonly artistName: string };
type Song = {
	readonly musicToken: string;
	readonly songName: string;
	readonly artistName: string;
};

function SearchingView() {
	return (
		<div className="py-8 text-center">
			<Loader2 className="w-5 h-5 animate-spin mx-auto text-[var(--color-text-dim)]" />
		</div>
	);
}

function ResultsView({
	artists,
	songs,
	isPending,
	onAdd,
}: {
	readonly artists: readonly Artist[];
	readonly songs: readonly Song[];
	readonly isPending: boolean;
	readonly onAdd: (musicToken: string) => void;
}) {
	return (
		<>
			{artists.length > 0 && (
				<div className="mb-2">
					<p className="text-xs text-[var(--color-text-dim)] px-3 py-1">
						Artists
					</p>
					{artists.map((artist) => (
						<button
							key={artist.musicToken}
							type="button"
							onClick={() => onAdd(artist.musicToken)}
							disabled={isPending}
							className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--color-bg-highlight)] text-left disabled:opacity-50"
						>
							<div className="w-8 h-8 rounded-full bg-[var(--color-bg-highlight)] flex items-center justify-center shrink-0">
								<User className="w-4 h-4 text-[var(--color-text-muted)]" />
							</div>
							<span className="text-sm text-[var(--color-text)] truncate">
								{artist.artistName}
							</span>
							<span className="ml-auto text-xs text-[var(--color-primary)] bg-[var(--color-bg-highlight)] px-2 py-0.5 rounded shrink-0">
								Add
							</span>
						</button>
					))}
				</div>
			)}

			{songs.length > 0 && (
				<div>
					<p className="text-xs text-[var(--color-text-dim)] px-3 py-1">
						Songs
					</p>
					{songs.map((song) => (
						<button
							key={song.musicToken}
							type="button"
							onClick={() => onAdd(song.musicToken)}
							disabled={isPending}
							className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--color-bg-highlight)] text-left disabled:opacity-50"
						>
							<div className="w-8 h-8 rounded-full bg-[var(--color-bg-highlight)] flex items-center justify-center shrink-0">
								<Music className="w-4 h-4 text-[var(--color-text-muted)]" />
							</div>
							<div className="flex-1 min-w-0">
								<p className="text-sm text-[var(--color-text)] truncate">
									{song.songName}
								</p>
								<p className="text-xs text-[var(--color-text-dim)] truncate">
									{song.artistName}
								</p>
							</div>
							<span className="ml-auto text-xs text-[var(--color-primary)] bg-[var(--color-bg-highlight)] px-2 py-0.5 rounded shrink-0">
								Add
							</span>
						</button>
					))}
				</div>
			)}
		</>
	);
}

function EmptyView({ query }: { readonly query: string }) {
	return (
		<div className="py-8 text-center text-[var(--color-text-dim)] text-sm">
			No results found for &ldquo;{query}&rdquo;
		</div>
	);
}

function PromptView() {
	return (
		<div className="py-8 text-center text-[var(--color-text-dim)] text-sm">
			Search for artists or songs to add as seeds
		</div>
	);
}
