import { Button } from "@app/shared/ui/Button";
import { ChevronLeft, Play, Plus } from "lucide-react";

type StationDetailHeaderProps = {
  readonly stationName: string;
  readonly isPlaying: boolean;
  readonly onBack: () => void;
  readonly onPlay: () => void;
  readonly onAddSeed: () => void;
};

export function StationDetailHeader({
  stationName,
  isPlaying,
  onBack,
  onPlay,
  onAddSeed,
}: StationDetailHeaderProps) {
  return (
    <>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onBack}
          className="p-2 hover:bg-pyxis-highlight transition-colors"
          aria-label="Back to stations"
        >
          <ChevronLeft className="w-5 h-5 text-pyxis-muted" />
        </button>
        <div className="flex-1">
          <h2 className="zune-display zune-page-title text-pyxis-text">
            {stationName}
          </h2>
          <p className="zune-meta mt-1">station details</p>
        </div>
        {!isPlaying ? (
          <Button
            onClick={onPlay}
            className="gap-2 bg-pyxis-primary hover:brightness-110 text-pyxis-bg"
          >
            <Play className="w-4 h-4" fill="currentColor" />
            Play
          </Button>
        ) : null}
      </div>

      <div className="flex items-center justify-between mb-3">
        <h3 className="zune-label text-pyxis-muted">seeds</h3>
        <button
          type="button"
          onClick={onAddSeed}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-pyxis-primary hover:bg-pyxis-highlight transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Seed
        </button>
      </div>
    </>
  );
}
