import { useTrackInfoTraits } from "./TrackInfoTraits.context";
import { TrackInfoTraitsLoading } from "./TrackInfoTraitsLoading";

export function TrackInfoTraitsLoadingState() {
  const { state } = useTrackInfoTraits();
  if (state._tag !== "Loading") return null;
  return <TrackInfoTraitsLoading />;
}
