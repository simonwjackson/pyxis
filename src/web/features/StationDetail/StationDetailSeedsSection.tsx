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
  return (
    <>
      <StationDetailSeedsEmpty state={state} />
      <StationDetailSeedsReady
        state={state}
        isRemoving={isRemoving}
        onRemove={onRemove}
      />
    </>
  );
}

function StationDetailSeedsReady({
  state,
  isRemoving,
  onRemove,
}: {
  readonly state: StationDetailSeedsState;
  readonly isRemoving: boolean;
  readonly onRemove: (seedId: string) => void;
}) {
  if (state._tag !== "Ready") return null;
  return (
    <div>
      <StationDetailArtistSeedsGroup
        seeds={state.artists}
        isRemoving={isRemoving}
        onRemove={onRemove}
      />
      <StationDetailSongSeedsGroup
        seeds={state.songs}
        isRemoving={isRemoving}
        onRemove={onRemove}
      />
    </div>
  );
}

function StationDetailSeedsEmpty({
  state,
}: {
  readonly state: StationDetailSeedsState;
}) {
  if (state._tag !== "Empty") return null;
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
  if (seeds.length === 0) return null;
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
  if (seeds.length === 0) return null;
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
