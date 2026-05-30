import { ThumbsDown, ThumbsUp } from "lucide-react";
import { StationDetailFeedbackRow } from "./StationDetailFeedbackRow";
import type { StationDetailFeedbackState } from "./StationDetailState";

type StationDetailFeedbackSectionProps = {
  readonly state: StationDetailFeedbackState;
};

export function StationDetailFeedbackSection({
  state,
}: StationDetailFeedbackSectionProps) {
  return (
    <div>
      <h3 className="zune-label text-pyxis-muted mb-4">feedback</h3>

      {state._tag === "Empty" ? <StationDetailFeedbackEmpty /> : null}
      {state._tag === "Ready" ? (
        <>
          {state.liked.length > 0 ? (
            <StationDetailLikedFeedbackGroup feedback={state.liked} />
          ) : null}
          {state.disliked.length > 0 ? (
            <StationDetailDislikedFeedbackGroup feedback={state.disliked} />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function StationDetailFeedbackEmpty() {
  return (
    <p className="py-6 text-center text-pyxis-dim text-sm">
      No feedback for this station yet.
    </p>
  );
}

type StationDetailFeedbackGroupProps = {
  readonly feedback: Extract<
    StationDetailFeedbackState,
    { _tag: "Ready" }
  >["liked"];
};

function StationDetailLikedFeedbackGroup({
  feedback,
}: StationDetailFeedbackGroupProps) {
  return (
    <div className="mb-4">
      <p className="text-xs text-pyxis-dim mb-1 flex items-center gap-1">
        <ThumbsUp className="w-3 h-3 text-pyxis-success" />
        liked
      </p>
      <div className="space-y-1">
        {feedback.map((entry) => (
          <StationDetailFeedbackRow key={entry.feedbackId} feedback={entry} />
        ))}
      </div>
    </div>
  );
}

function StationDetailDislikedFeedbackGroup({
  feedback,
}: StationDetailFeedbackGroupProps) {
  return (
    <div>
      <p className="text-xs text-pyxis-dim mb-1 flex items-center gap-1">
        <ThumbsDown className="w-3 h-3 text-pyxis-error" />
        disliked
      </p>
      <div className="space-y-1">
        {feedback.map((entry) => (
          <StationDetailFeedbackRow key={entry.feedbackId} feedback={entry} />
        ))}
      </div>
    </div>
  );
}
