import { StationDetailArtistSeedRow } from "./StationDetailArtistSeedRow";
import { StationDetailSongSeedRow } from "./StationDetailSongSeedRow";
import type { StationDetailSeedsState } from "./StationDetailState";

type StationDetailSeedsSectionProps = {
  readonly state: StationDetailSeedsState;
  readonly isRemoving: boolean;
  readonly onRemove: (seedId: string) => void;
};

export function StationDetailSeedsSection({
  state,
  isRemoving,
  onRemove,
}: StationDetailSeedsSectionProps) {
  switch (state._tag) {
    case "Empty":
      return <StationDetailSeedsEmpty />;
    case "Ready":
      return (
        <div>
          {state.artists.length > 0 ? (
            <StationDetailArtistSeedsGroup
              seeds={state.artists}
              isRemoving={isRemoving}
              onRemove={onRemove}
            />
          ) : null}
          {state.songs.length > 0 ? (
            <StationDetailSongSeedsGroup
              seeds={state.songs}
              isRemoving={isRemoving}
              onRemove={onRemove}
            />
          ) : null}
        </div>
      );
  }
}

function StationDetailSeedsEmpty() {
  return (
    <p className="py-6 text-center text-pyxis-dim text-sm">
      No seeds found for this station.
    </p>
  );
}

type StationDetailSeedGroupProps = {
  readonly seeds: Extract<
    StationDetailSeedsState,
    { _tag: "Ready" }
  >["artists"];
  readonly isRemoving: boolean;
  readonly onRemove: (seedId: string) => void;
};

function StationDetailArtistSeedsGroup({
  seeds,
  isRemoving,
  onRemove,
}: StationDetailSeedGroupProps) {
  return (
    <div className="space-y-1 mb-4">
      <p className="text-xs text-pyxis-dim mb-1">Artists</p>
      {seeds.map((seed) => (
        <StationDetailArtistSeedRow
          key={seed.seedId}
          seed={seed}
          isRemoving={isRemoving}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}

function StationDetailSongSeedsGroup({
  seeds,
  isRemoving,
  onRemove,
}: StationDetailSeedGroupProps) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-pyxis-dim mb-1">Songs</p>
      {seeds.map((seed) => (
        <StationDetailSongSeedRow
          key={seed.seedId}
          seed={seed}
          isRemoving={isRemoving}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}
