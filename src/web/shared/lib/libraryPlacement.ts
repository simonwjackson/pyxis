export type AlbumPlacement =
  | "discovery"
  | "collection"
  | "archive"
  | "dismissed";

export type AlbumPlacementState = {
  readonly placement: AlbumPlacement;
  readonly isHot?: boolean;
};

export function formatPlacementLabel(placement: AlbumPlacement): string {
  switch (placement) {
    case "discovery":
      return "Discovery";
    case "collection":
      return "Collection";
    case "archive":
      return "Archive";
    case "dismissed":
      return "Dismissed";
  }
}

export function placementBadgeClassName(placement: AlbumPlacement): string {
  switch (placement) {
    case "discovery":
      return "bg-pyxis-primary/15 text-pyxis-primary";
    case "collection":
      return "bg-pyxis-success/15 text-pyxis-success";
    case "archive":
      return "bg-pyxis-accent/15 text-pyxis-accent";
    case "dismissed":
      return "bg-pyxis-error/15 text-pyxis-error";
  }
}

export function hotBadgeClassName(): string {
  return "bg-pyxis-accent/15 text-pyxis-accent";
}
