/**
 * @module TrackInfoModal
 * Modal dialog displaying detailed track information and Pandora Music Genome traits.
 */

import { X, Loader2, Music } from "lucide-react";
import { trpc } from "./lib/trpc";

/**
 * Props for the TrackInfoModal component.
 */
type TrackInfoModalProps = {
	/** Track ID for fetching Music Genome traits */
	readonly trackId: string;
	/** Track title */
	readonly songName: string;
	/** Artist name */
	readonly artistName: string;
	/** Album name */
	readonly albumName: string;
	/** Album artwork URL */
	readonly albumArtUrl?: string | undefined;
	/** Track duration in seconds */
	readonly duration: number;
	/** Callback to close the modal */
	readonly onClose: () => void;
};

function formatDuration(seconds: number): string {
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${String(mins)}:${String(secs).padStart(2, "0")}`;
}

type ArtworkProps = {
	readonly albumArtUrl?: string | undefined;
	readonly albumName: string;
};

function Artwork({ albumArtUrl, albumName }: ArtworkProps) {
	if (albumArtUrl) {
		return (
			<img
				src={albumArtUrl}
				alt={`${albumName} album art`}
				className="w-20 h-20 rounded-lg shrink-0 object-cover"
			/>
		);
	}

	return (
		<div className="w-20 h-20 rounded-lg shrink-0 bg-[var(--color-bg-highlight)] flex items-center justify-center">
			<Music className="w-8 h-8 text-[var(--color-text-dim)]" />
		</div>
	);
}

type HeaderProps = {
	readonly songName: string;
	readonly artistName: string;
	readonly albumName: string;
	readonly albumArtUrl?: string | undefined;
	readonly duration: number;
};

function Header({
	songName,
	artistName,
	albumName,
	albumArtUrl,
	duration,
}: HeaderProps) {
	return (
		<div className="flex gap-4">
			<Artwork albumArtUrl={albumArtUrl} albumName={albumName} />
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
	);
}

function TraitsLoading() {
	return (
		<div className="flex items-center gap-2 py-3 text-[var(--color-text-dim)] text-sm">
			<Loader2 className="w-4 h-4 animate-spin" />
			Loading traits...
		</div>
	);
}

function TraitsError() {
	return (
		<p className="py-3 text-[var(--color-error)] text-sm">
			Failed to load traits.
		</p>
	);
}

function TraitsEmpty() {
	return (
		<p className="py-3 text-[var(--color-text-dim)] text-sm">
			No traits available for this track.
		</p>
	);
}

type Explanation = {
	readonly focusTraitId: string;
	readonly focusTraitName: string;
};

function TraitsList({
	explanations,
}: { readonly explanations: readonly Explanation[] }) {
	return (
		<div className="space-y-2">
			{explanations.map((trait) => (
				<div
					key={trait.focusTraitId}
					className="flex items-center gap-2 text-sm"
				>
					<div className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] shrink-0" />
					<span className="text-[var(--color-text-muted)]">
						{trait.focusTraitName}
					</span>
				</div>
			))}
		</div>
	);
}

function Traits({ trackId }: { readonly trackId: string }) {
	const explainQuery = trpc.track.explain.useQuery(
		{ id: trackId },
		{ retry: 1 },
	);

	return (
		<div>
			<h3 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-3">
				Music Genome Traits
			</h3>

			{explainQuery.isLoading && <TraitsLoading />}
			{explainQuery.error && <TraitsError />}
			{explainQuery.data &&
				(explainQuery.data.explanations.length === 0 ? (
					<TraitsEmpty />
				) : (
					<TraitsList
						explanations={explainQuery.data.explanations}
					/>
				))}
		</div>
	);
}

/**
 * Modal dialog showing track details and Music Genome traits.
 * Includes track metadata, album artwork, and Pandora's musical analysis.
 * Closes on Escape key or clicking outside the modal.
 *
 * @param props - Track information and close callback
 */
export function TrackInfoModal({
	trackId,
	songName,
	artistName,
	albumName,
	albumArtUrl,
	duration,
	onClose,
}: TrackInfoModalProps) {
	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center"
			onClick={onClose}
			onKeyDown={(e) => {
				if (e.key === "Escape") onClose();
			}}
			role="dialog"
			aria-modal="true"
			aria-labelledby="track-info-title"
		>
			<div className="fixed inset-0 bg-black/60" aria-hidden="true" />
			<div
				className="relative bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl max-w-md w-full shadow-2xl mx-4 max-h-[80vh] flex flex-col"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={() => {}}
			>
				<div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
					<h2 id="track-info-title" className="text-lg font-semibold text-[var(--color-text)]">
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

				<div className="flex-1 overflow-y-auto p-4 space-y-6">
					<Header
						songName={songName}
						artistName={artistName}
						albumName={albumName}
						albumArtUrl={albumArtUrl}
						duration={duration}
					/>
					<Traits trackId={trackId} />
				</div>
			</div>
		</div>
	);
}

TrackInfoModal.Header = Header;
TrackInfoModal.Artwork = Artwork;
TrackInfoModal.Traits = Traits;
TrackInfoModal.TraitsLoading = TraitsLoading;
TrackInfoModal.TraitsError = TraitsError;
TrackInfoModal.TraitsEmpty = TraitsEmpty;
TrackInfoModal.TraitsList = TraitsList;
