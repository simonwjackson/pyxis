import { useTrackInfoTraits } from "./TrackInfoTraits.context";
import { TrackInfoTraitsEmpty } from "./TrackInfoTraitsEmpty";

export function TrackInfoTraitsEmptyState() {
  const { state } = useTrackInfoTraits();
  if (state._tag !== "Empty") return null;
  return <TrackInfoTraitsEmpty />;
}
