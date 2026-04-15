import { trpc } from "@/web/shared/lib/trpc";
import { TrackInfoTraitsEmpty } from "./TrackInfoTraitsEmpty";
import { TrackInfoTraitsError } from "./TrackInfoTraitsError";
import { TrackInfoTraitsList } from "./TrackInfoTraitsList";
import { TrackInfoTraitsLoading } from "./TrackInfoTraitsLoading";

type TrackInfoTraitsProps = {
	readonly trackId: string;
};

export function TrackInfoTraits({ trackId }: TrackInfoTraitsProps) {
	const explainQuery = trpc.track.explain.useQuery({ id: trackId }, { retry: 1 });

	return (
		<div>
			<h3 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-3">
				Music Genome Traits
			</h3>

			{explainQuery.isLoading ? <TrackInfoTraitsLoading /> : null}
			{explainQuery.error ? <TrackInfoTraitsError /> : null}
			{explainQuery.data
				? explainQuery.data.explanations.length === 0
					? <TrackInfoTraitsEmpty />
					: <TrackInfoTraitsList explanations={explainQuery.data.explanations} />
				: null}
		</div>
	);
}
