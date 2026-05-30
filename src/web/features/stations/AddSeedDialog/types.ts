export type AddSeedDialogProps = {
  readonly radioId: string;
  readonly onClose: () => void;
};

export type AddSeedArtist = {
  readonly musicToken: string;
  readonly artistName: string;
};

export type AddSeedSong = {
  readonly musicToken: string;
  readonly songName: string;
  readonly artistName: string;
};
