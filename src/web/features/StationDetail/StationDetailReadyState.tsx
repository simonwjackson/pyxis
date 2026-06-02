import { AddSeedDialog } from "@app/features/stations/AddSeedDialog";
import { StationDetailFeedbackSection } from "./StationDetailFeedbackSection";
import { StationDetailHeader } from "./StationDetailHeader";
import { useStationDetailPage } from "./StationDetailPage.context";
import { StationDetailSeedsSection } from "./StationDetailSeedsSection";
import { StationDetailState } from "./StationDetailState";

export function StationDetailReadyState() {
  const {
    state,
    token,
    showAddSeed,
    isPlaying,
    isRemovingSeed,
    back,
    play,
    openAddSeed,
    closeAddSeed,
    removeSeed,
  } = useStationDetailPage();
  if (state._tag !== "Ready") return null;

  const station = state.station;
  return (
    <div className="page-frame lattice-container space-y-8 max-w-3xl mx-auto">
      <StationDetailHeader
        stationName={station.name}
        isPlaying={isPlaying}
        onBack={back}
        onPlay={play}
        onAddSeed={openAddSeed}
      />

      <StationDetailSeedsSection
        state={StationDetailState.seeds(station)}
        isRemoving={isRemovingSeed}
        onRemove={removeSeed}
      />

      <StationDetailFeedbackSection
        state={StationDetailState.feedback(station)}
      />

      {showAddSeed ? (
        <AddSeedDialog radioId={token} onClose={closeAddSeed} />
      ) : null}
    </div>
  );
}
