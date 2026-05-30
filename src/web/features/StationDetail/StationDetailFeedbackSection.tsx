import { ThumbsDown, ThumbsUp } from "lucide-react";
import type { ReactNode } from "react";

type StationDetailFeedbackSectionProps = {
  readonly hasFeedback: boolean;
  readonly likedFeedback: ReactNode;
  readonly dislikedFeedback: ReactNode;
};

export function StationDetailFeedbackSection({
  hasFeedback,
  likedFeedback,
  dislikedFeedback,
}: StationDetailFeedbackSectionProps) {
  return (
    <div>
      <h3 className="zune-label text-pyxis-muted mb-4">feedback</h3>

      {!hasFeedback ? (
        <p className="py-6 text-center text-pyxis-dim text-sm">
          No feedback for this station yet.
        </p>
      ) : null}

      {likedFeedback}
      {dislikedFeedback}
    </div>
  );
}

export function StationDetailLikedFeedbackGroup({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <div className="mb-4">
      <p className="text-xs text-pyxis-dim mb-1 flex items-center gap-1">
        <ThumbsUp className="w-3 h-3 text-[var(--color-liked)]" />
        liked
      </p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

export function StationDetailDislikedFeedbackGroup({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-pyxis-dim mb-1 flex items-center gap-1">
        <ThumbsDown className="w-3 h-3 text-pyxis-error" />
        disliked
      </p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
