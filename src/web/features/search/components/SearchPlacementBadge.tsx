import {
  type AlbumPlacement,
  formatPlacementLabel,
  placementBadgeClassName,
} from "@app/shared/lib/library-placement";

type SearchPlacementBadgeProps = {
  readonly placement: AlbumPlacement;
};

export function SearchPlacementBadge({ placement }: SearchPlacementBadgeProps) {
  return (
    <span
      className={`text-[10px] uppercase tracking-[0.18em] px-1.5 py-0.5 ${placementBadgeClassName(placement)}`}
    >
      {formatPlacementLabel(placement)}
    </span>
  );
}
