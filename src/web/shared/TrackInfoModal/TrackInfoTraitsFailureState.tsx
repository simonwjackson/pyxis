import { useTrackInfoTraits } from "./TrackInfoTraits.context";
import { TrackInfoTraitsError } from "./TrackInfoTraitsError";

export function TrackInfoTraitsFailureState() {
  const { state } = useTrackInfoTraits();
  if (state._tag !== "LoadError" && state._tag !== "Defect") return null;
  return <TrackInfoTraitsError />;
}
