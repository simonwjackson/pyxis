import { X, Loader2, Music } from "lucide-react";
import { trpc } from "../../lib/trpc";
import type { PlaylistItem } from "../../../types/api";

type TrackInfoModalProps = {
	readonly track: PlaylistItem;
	readonly duration: number;
	readonly onClose: () => void;
};

function formatDuration(seconds: number): string {
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${String(mins)}:${String(secs).padStart(2, "0")}`;
}

export function TrackInfoModal({
	track,
	duration,
	onClose,
}: TrackInfoModalProps) {
	const explainQuery = trpc.playback.explainTrack.useQuery(
		{ trackToken: track.trackToken },
		{ retry: 1 },
	);

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center"
			onClick={onClose}
			onKeyDown={(e) => {
				if (e.key === "Escape") onClose();
			}}
		>
			<div className="fixed inset-0 bg-black/60" />
			<div
				className="relative bg-zinc-900 border border-zinc-700 rounded-xl max-w-md w-full shadow-2xl mx-4 max-h-[80vh] flex flex-col"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={() => {}}
			>
				{/* Header */}
				<div className="flex items-center justify-between p-4 border-b border-zinc-800">
					<h2 className="text-lg font-semibold text-zinc-100">
						Track Info
					</h2>
					<button
						type="button"
						onClick={onClose}
						className="p-1.5 hover:bg-zinc-800 rounded-lg transition-colors"
						aria-label="Close"
					>
						<X className="w-5 h-5 text-zinc-400" />
					</button>
				</div>

				{/* Scrollable body */}
				<div className="flex-1 overflow-y-auto p-4 space-y-6">
					{/* Track details */}
					<div className="flex gap-4">
						{track.albumArtUrl ? (
							<img
								src={track.albumArtUrl}
								alt={`${track.albumName} album art`}
								className="w-20 h-20 rounded-lg shrink-0 object-cover"
							/>
						) : (
							<div className="w-20 h-20 rounded-lg shrink-0 bg-zinc-800 flex items-center justify-center">
								<Music className="w-8 h-8 text-zinc-600" />
							</div>
						)}
						<div className="min-w-0">
							<p className="font-semibold text-zinc-100 truncate">
								{track.songName}
							</p>
							<p className="text-sm text-zinc-400 truncate">
								{track.artistName}
							</p>
							<p className="text-sm text-zinc-500 truncate">
								{track.albumName}
							</p>
							{duration > 0 && (
								<p className="text-xs text-zinc-600 mt-1">
									Duration: {formatDuration(duration)}
								</p>
							)}
						</div>
					</div>

					{/* Music Genome Traits */}
					<div>
						<h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wide mb-3">
							Music Genome Traits
						</h3>

						{explainQuery.isLoading && (
							<div className="flex items-center gap-2 py-3 text-zinc-500 text-sm">
								<Loader2 className="w-4 h-4 animate-spin" />
								Loading traits...
							</div>
						)}

						{explainQuery.error && (
							<p className="py-3 text-red-400 text-sm">
								Failed to load traits.
							</p>
						)}

						{explainQuery.data && (
							<>
								{explainQuery.data.explanations.length ===
								0 ? (
									<p className="py-3 text-zinc-500 text-sm">
										No traits available for this track.
									</p>
								) : (
									<div className="space-y-2">
										{explainQuery.data.explanations.map(
											(trait) => (
												<div
													key={trait.focusTraitId}
													className="flex items-center gap-2 text-sm"
												>
													<div className="w-1.5 h-1.5 rounded-full bg-cyan-500 shrink-0" />
													<span className="text-zinc-300">
														{trait.focusTraitName}
													</span>
												</div>
											),
										)}
									</div>
								)}
							</>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
