/**
 * @module TrackInfoModal
 * Modal dialog displaying detailed track information and Pandora Music Genome traits.
 */

import { X } from "lucide-react";
import { TrackInfoHeader } from "./track-info-modal/TrackInfoHeader";
import { TrackInfoTraits } from "./track-info-modal/TrackInfoTraits";
import type { TrackInfoModalProps } from "./track-info-modal/types";

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
			onKeyDown={(event) => {
				if (event.key === "Escape") onClose();
			}}
			role="dialog"
			aria-modal="true"
			aria-labelledby="track-info-title"
		>
			<div className="fixed inset-0 bg-black/60" aria-hidden="true" />
			<div
				className="relative bg-[var(--color-bg)] border border-[var(--color-border)] max-w-md w-full shadow-2xl mx-4 max-h-[80vh] flex flex-col"
				onClick={(event) => event.stopPropagation()}
				onKeyDown={() => {}}
			>
				<div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
					<h2 id="track-info-title" className="text-lg font-semibold text-[var(--color-text)]">
						Track Info
					</h2>
					<button
						type="button"
						onClick={onClose}
						className="p-1.5 hover:bg-[var(--color-bg-highlight)] transition-colors"
						aria-label="Close"
					>
						<X className="w-5 h-5 text-[var(--color-text-muted)]" />
					</button>
				</div>

				<div className="flex-1 overflow-y-auto p-4 space-y-6">
					<TrackInfoHeader
						songName={songName}
						artistName={artistName}
						albumName={albumName}
						albumArtUrl={albumArtUrl}
						duration={duration}
					/>
					<TrackInfoTraits trackId={trackId} />
				</div>
			</div>
		</div>
	);
}
