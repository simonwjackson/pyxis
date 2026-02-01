import { X, Loader2, Music } from "lucide-react";
import { trpc } from "../../lib/trpc";

type TrackInfoModalProps = {
	readonly trackId: string;
	readonly songName: string;
	readonly artistName: string;
	readonly albumName: string;
	readonly albumArtUrl?: string | undefined;
	readonly duration: number;
	readonly onClose: () => void;
};

function formatDuration(seconds: number): string {
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${String(mins)}:${String(secs).padStart(2, "0")}`;
}

export function TrackInfoModal({
	trackId,
	songName,
	artistName,
	albumName,
	albumArtUrl,
	duration,
	onClose,
}: TrackInfoModalProps) {
	const explainQuery = trpc.track.explain.useQuery(
		{ id: trackId },
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
				className="relative bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl max-w-md w-full shadow-2xl mx-4 max-h-[80vh] flex flex-col"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={() => {}}
			>
				{/* Header */}
				<div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
					<h2 className="text-lg font-semibold text-[var(--color-text)]">
						Track Info
					</h2>
					<button
						type="button"
						onClick={onClose}
						className="p-1.5 hover:bg-[var(--color-bg-highlight)] rounded-lg transition-colors"
						aria-label="Close"
					>
						<X className="w-5 h-5 text-[var(--color-text-muted)]" />
					</button>
				</div>

				{/* Scrollable body */}
				<div className="flex-1 overflow-y-auto p-4 space-y-6">
					{/* Track details */}
					<div className="flex gap-4">
						{albumArtUrl ? (
							<img
								src={albumArtUrl}
								alt={`${albumName} album art`}
								className="w-20 h-20 rounded-lg shrink-0 object-cover"
							/>
						) : (
							<div className="w-20 h-20 rounded-lg shrink-0 bg-[var(--color-bg-highlight)] flex items-center justify-center">
								<Music className="w-8 h-8 text-[var(--color-text-dim)]" />
							</div>
						)}
						<div className="min-w-0">
							<p className="font-semibold text-[var(--color-text)] truncate">
								{songName}
							</p>
							<p className="text-sm text-[var(--color-text-muted)] truncate">
								{artistName}
							</p>
							<p className="text-sm text-[var(--color-text-dim)] truncate">
								{albumName}
							</p>
							{duration > 0 && (
								<p className="text-xs text-[var(--color-text-dim)] mt-1">
									Duration: {formatDuration(duration)}
								</p>
							)}
						</div>
					</div>

					{/* Music Genome Traits */}
					<div>
						<h3 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-3">
							Music Genome Traits
						</h3>

						{explainQuery.isLoading && (
							<div className="flex items-center gap-2 py-3 text-[var(--color-text-dim)] text-sm">
								<Loader2 className="w-4 h-4 animate-spin" />
								Loading traits...
							</div>
						)}

						{explainQuery.error && (
							<p className="py-3 text-[var(--color-error)] text-sm">
								Failed to load traits.
							</p>
						)}

						{explainQuery.data && (
							<>
								{explainQuery.data.explanations.length ===
								0 ? (
									<p className="py-3 text-[var(--color-text-dim)] text-sm">
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
													<div className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] shrink-0" />
													<span className="text-[var(--color-text-muted)]">
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
