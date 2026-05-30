import type { ReactNode } from "react";

type StationDetailSeedsSectionProps = {
  readonly hasSeeds: boolean;
  readonly artistSeeds: ReactNode;
  readonly songSeeds: ReactNode;
};

export function StationDetailSeedsSection({
  hasSeeds,
  artistSeeds,
  songSeeds,
}: StationDetailSeedsSectionProps) {
  return (
    <div>
      {!hasSeeds ? (
        <p className="py-6 text-center text-pyxis-dim text-sm">
          No seeds found for this station.
        </p>
      ) : null}

      {artistSeeds}
      {songSeeds}
    </div>
  );
}
