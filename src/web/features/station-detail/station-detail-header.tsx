import { ChevronLeft, Play, Plus } from "lucide-react";
import { Button } from "@/web/shared/ui/button";

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
					className="p-2 hover:bg-[var(--color-bg-highlight)] transition-colors"
					aria-label="Back to stations"
				>
					<ChevronLeft className="w-5 h-5 text-[var(--color-text-muted)]" />
				</button>
				<div className="flex-1">
					<h2 className="zune-display zune-page-title text-[var(--color-text)]">
						{stationName}
					</h2>
					<p className="zune-meta mt-1">station details</p>
				</div>
				{!isPlaying ? (
					<Button
						onClick={onPlay}
						className="gap-2 bg-[var(--color-primary)] hover:brightness-110 text-[var(--color-bg)]"
					>
						<Play className="w-4 h-4" fill="currentColor" />
						Play
					</Button>
				) : null}
			</div>

			<div className="flex items-center justify-between mb-3">
				<h3 className="zune-label text-[var(--color-text-muted)]">seeds</h3>
				<button
					type="button"
					onClick={onAddSeed}
					className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[var(--color-primary)] hover:bg-[var(--color-bg-highlight)] transition-colors"
				>
					<Plus className="w-4 h-4" />
					Add Seed
				</button>
			</div>
		</>
	);
}
