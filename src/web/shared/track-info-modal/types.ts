export type TrackInfoModalProps = {
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

export type TrackInfoExplanation = {
  readonly traitId: string;
  readonly traitName: string;
};
