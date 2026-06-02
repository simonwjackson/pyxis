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

      <StationDetailFeedbackBody state={state} />
    </div>
  );
}

function StationDetailFeedbackBody({
  state,
}: {
  readonly state: StationDetailFeedbackState;
}) {
  return (
    <>
      <StationDetailFeedbackEmpty state={state} />
      <StationDetailFeedbackReady state={state} />
    </>
  );
}

function StationDetailFeedbackReady({
  state,
}: {
  readonly state: StationDetailFeedbackState;
}) {
  if (state._tag !== "Ready") return null;
  return (
    <>
      <StationDetailLikedFeedbackGroup feedback={state.liked} />
      <StationDetailDislikedFeedbackGroup feedback={state.disliked} />
    </>
  );
}

function StationDetailFeedbackEmpty({
  state,
}: {
  readonly state: StationDetailFeedbackState;
}) {
  if (state._tag !== "Empty") return null;
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
  if (feedback.length === 0) return null;
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
  if (feedback.length === 0) return null;
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
