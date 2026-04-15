import type { StationFeedback } from "./types";

type StationDetailFeedbackRowProps = {
	readonly feedback: StationFeedback;
};

export function StationDetailFeedbackRow({
	feedback,
}: StationDetailFeedbackRowProps) {
	return (
		<div className="flex items-center gap-3 p-2 bg-[var(--color-bg-highlight)]">
			<p className="text-sm text-[var(--color-text-muted)] flex-1 truncate">
				{feedback.songName}
			</p>
			<p className="text-xs text-[var(--color-text-dim)] shrink-0">
				{feedback.artistName}
			</p>
		</div>
	);
}
