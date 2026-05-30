/**
 * @module TrackInfoModal
 * Modal dialog displaying detailed track information and Pandora Music Genome traits.
 */

import { X } from "lucide-react";
import { TrackInfoHeader } from "./TrackInfoModal/TrackInfoHeader";
import { TrackInfoTraits } from "./TrackInfoModal/TrackInfoTraits";
import type { TrackInfoModalProps } from "./TrackInfoModal/types";

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
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="track-info-title"
    >
      <button
        type="button"
        className="fixed inset-0 bg-black/60"
        onClick={onClose}
        aria-label="Close track info"
      />
      <div className="relative bg-pyxis-bg border border-pyxis-border max-w-md w-full shadow-2xl mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-pyxis-border">
          <h2
            id="track-info-title"
            className="text-lg font-semibold text-pyxis-text"
          >
            Track Info
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-pyxis-highlight transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-pyxis-muted" />
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
