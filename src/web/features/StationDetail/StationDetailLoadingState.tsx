import { useStationDetailPage } from "./StationDetailPage.context";
import { StationDetailSkeleton } from "./StationDetailSkeleton";

export function StationDetailLoadingState() {
  const { state } = useStationDetailPage();
  if (state._tag !== "Loading") return null;
  return <StationDetailSkeleton />;
}
