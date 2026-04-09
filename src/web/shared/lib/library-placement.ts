export type AlbumPlacement = "discovery" | "collection" | "archive" | "dismissed";

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
			return "bg-[var(--color-primary)]/15 text-[var(--color-primary)]";
		case "collection":
			return "bg-emerald-500/15 text-emerald-300";
		case "archive":
			return "bg-amber-500/15 text-amber-300";
		case "dismissed":
			return "bg-rose-500/15 text-rose-300";
	}
}

export function hotBadgeClassName(): string {
	return "bg-fuchsia-500/15 text-fuchsia-300";
}
