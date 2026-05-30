import type { StationFeedback } from "./types";

type StationDetailFeedbackRowProps = {
  readonly feedback: StationFeedback;
};

export function StationDetailFeedbackRow({
  feedback,
}: StationDetailFeedbackRowProps) {
  return (
    <div className="flex items-center gap-3 p-2 bg-pyxis-highlight">
      <p className="text-sm text-pyxis-muted flex-1 truncate">
        {feedback.songName}
      </p>
      <p className="text-xs text-pyxis-dim shrink-0">{feedback.artistName}</p>
    </div>
  );
}
