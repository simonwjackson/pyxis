import { useAtomValue } from "@effect/atom-react";
import { useMemo } from "react";
import { PyxisRpcClient } from "@/web/shared/api/rpcClient";
import { projectQueryResult } from "@/web/shared/effect/projectQueryResult";
import { TrackInfoState } from "./TrackInfoState";
import { TrackInfoTraitsEmpty } from "./TrackInfoTraitsEmpty";
import { TrackInfoTraitsError } from "./TrackInfoTraitsError";
import { TrackInfoTraitsList } from "./TrackInfoTraitsList";
import { TrackInfoTraitsLoading } from "./TrackInfoTraitsLoading";

type TrackInfoTraitsProps = {
	readonly trackId: string;
};

export function TrackInfoTraits({ trackId }: TrackInfoTraitsProps) {
	const queryAtom = useMemo(
		() => PyxisRpcClient.query("track.explanation.get", { id: trackId }),
		[trackId],
	);
	const state = TrackInfoState.fromResult(
		projectQueryResult(useAtomValue(queryAtom)),
	);

	return (
		<div>
			<h3 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-3">
				Music Genome Traits
			</h3>

			{state._tag === "Loading" ? <TrackInfoTraitsLoading /> : null}
			{state._tag === "LoadError" || state._tag === "Defect" ? (
				<TrackInfoTraitsError />
			) : null}
			{state._tag === "Empty" ? <TrackInfoTraitsEmpty /> : null}
			{state._tag === "Ready" ? (
				<TrackInfoTraitsList explanations={state.traits} />
			) : null}
		</div>
	);
}
