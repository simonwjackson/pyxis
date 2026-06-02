import { useTrackInfoTraits } from "./TrackInfoTraits.context";
import { TrackInfoTraitsList } from "./TrackInfoTraitsList";

export function TrackInfoTraitsReadyState() {
  const { state } = useTrackInfoTraits();
  if (state._tag !== "Ready") return null;
  return <TrackInfoTraitsList explanations={state.traits} />;
}
