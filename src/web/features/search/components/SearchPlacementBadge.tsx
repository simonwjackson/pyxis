import {
  type AlbumPlacement,
  formatPlacementLabel,
  placementBadgeClassName,
} from "@app/shared/lib/libraryPlacement";

type SearchPlacementBadgeProps = {
  readonly placement: AlbumPlacement;
};

export function SearchPlacementBadge({ placement }: SearchPlacementBadgeProps) {
  return (
    <span
      className={`zune-badge px-1.5 py-0.5 ${placementBadgeClassName(placement)}`}
    >
      {formatPlacementLabel(placement)}
    </span>
  );
}
