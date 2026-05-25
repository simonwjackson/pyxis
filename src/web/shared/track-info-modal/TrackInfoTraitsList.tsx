import type { TrackInfoExplanation } from "./types";

type TrackInfoTraitsListProps = {
	readonly explanations: readonly TrackInfoExplanation[];
};

export function TrackInfoTraitsList({
	explanations,
}: TrackInfoTraitsListProps) {
	return (
		<div className="space-y-2">
			{explanations.map((trait) => (
				<div key={trait.traitId} className="flex items-center gap-2 text-sm">
					<div className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] shrink-0" />
					<span className="text-[var(--color-text-muted)]">
						{trait.traitName}
					</span>
				</div>
			))}
		</div>
	);
}
