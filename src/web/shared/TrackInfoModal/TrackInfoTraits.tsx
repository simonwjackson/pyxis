import { PyxisRpcClient } from "@app/shared/api/rpcClient";
import { projectQueryResult } from "@app/shared/effect/projectQueryResult";
import { useAtomValue } from "@effect/atom-react";
import { useMemo } from "react";
import { TrackInfoState } from "./TrackInfoState";
import { TrackInfoTraitsProvider } from "./TrackInfoTraits.context";
import { TrackInfoTraitsEmptyState } from "./TrackInfoTraitsEmptyState";
import { TrackInfoTraitsFailureState } from "./TrackInfoTraitsFailureState";
import { TrackInfoTraitsLoadingState } from "./TrackInfoTraitsLoadingState";
import { TrackInfoTraitsReadyState } from "./TrackInfoTraitsReadyState";

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
      <h3 className="text-sm font-medium text-pyxis-muted uppercase tracking-wide mb-3">
        Music Genome Traits
      </h3>

      <TrackInfoTraitsProvider value={{ state }}>
        <TrackInfoTraitsLoadingState />
        <TrackInfoTraitsFailureState />
        <TrackInfoTraitsEmptyState />
        <TrackInfoTraitsReadyState />
      </TrackInfoTraitsProvider>
    </div>
  );
}
