import { useState, useMemo } from "react";
import { Shuffle } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "../../lib/trpc";
import type { RadioStation } from "./StationList";

type QuickMixDialogProps = {
	readonly stations: readonly RadioStation[];
	readonly onClose: () => void;
};

export function QuickMixDialog({ stations, onClose }: QuickMixDialogProps) {
	const quickMixStation = stations.find((s) => s.isQuickMix);
	const initialIds = useMemo(
		() => new Set(quickMixStation?.quickMixStationIds ?? []),
		[quickMixStation],
	);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(
		() => new Set(initialIds),
	);
	const utils = trpc.useUtils();

	const mutation = trpc.radio.quickMix.useMutation({
		onSuccess() {
			utils.radio.list.invalidate();
			toast.success("Shuffle stations updated");
			onClose();
		},
		onError(err) {
			toast.error(`Failed to update shuffle: ${err.message}`);
		},
	});

	const nonQuickMixStations = stations.filter((s) => !s.isQuickMix);

	const toggle = (stationId: string) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(stationId)) {
				next.delete(stationId);
			} else {
				next.add(stationId);
			}
			return next;
		});
	};

	const selectAll = () => {
		setSelectedIds(new Set(nonQuickMixStations.map((s) => s.stationId)));
	};

	const selectNone = () => {
		setSelectedIds(new Set());
	};

	const handleSave = () => {
		mutation.mutate({ radioIds: [...selectedIds] });
	};

	return (
		<div
			className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50"
			onClick={onClose}
			onKeyDown={(e) => {
				if (e.key === "Escape") onClose();
			}}
		>
			<div
				className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl w-full max-w-md max-h-[70vh] flex flex-col shadow-2xl"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={() => {}}
			>
				<div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
					<div className="flex items-center gap-3">
						<div className="w-9 h-9 rounded-lg bg-[var(--color-bg-highlight)] flex items-center justify-center">
							<Shuffle className="w-4 h-4 text-[var(--color-secondary)]" />
						</div>
						<div>
							<h2 className="text-lg font-semibold text-[var(--color-text)]">
								Manage Shuffle
							</h2>
							<p className="text-sm text-[var(--color-text-dim)]">
								{selectedIds.size} of{" "}
								{nonQuickMixStations.length} stations selected
							</p>
						</div>
					</div>
					<div className="flex gap-2">
						<button
							type="button"
							onClick={selectAll}
							className="text-xs text-[var(--color-text-dim)] hover:text-[var(--color-text)] px-2 py-1 rounded hover:bg-[var(--color-bg-highlight)]"
						>
							All
						</button>
						<button
							type="button"
							onClick={selectNone}
							className="text-xs text-[var(--color-text-dim)] hover:text-[var(--color-text)] px-2 py-1 rounded hover:bg-[var(--color-bg-highlight)]"
						>
							None
						</button>
					</div>
				</div>

				<div className="flex-1 overflow-y-auto p-2 space-y-0.5">
					{nonQuickMixStations.map((station) => {
						const checked = selectedIds.has(station.stationId);
						return (
							<label
								key={station.stationId}
								className="flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--color-bg-highlight)] cursor-pointer"
							>
								<input
									type="checkbox"
									checked={checked}
									onChange={() => toggle(station.stationId)}
									className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-secondary)] focus:ring-[var(--color-border-active)] bg-[var(--color-bg-highlight)]"
								/>
								<span
									className={`text-sm ${checked ? "text-[var(--color-text)]" : "text-[var(--color-text-muted)]"}`}
								>
									{station.name}
								</span>
							</label>
						);
					})}
				</div>

				<div className="p-4 border-t border-[var(--color-border)] flex gap-3 justify-end shrink-0">
					<button
						type="button"
						onClick={onClose}
						disabled={mutation.isPending}
						className="px-4 py-2 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-bg-highlight)] rounded-lg"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={handleSave}
						disabled={mutation.isPending}
						className="px-4 py-2 text-sm text-[var(--color-bg)] bg-[var(--color-secondary)] hover:brightness-110 rounded-lg font-medium disabled:opacity-50"
					>
						{mutation.isPending ? "Saving..." : "Save"}
					</button>
				</div>
			</div>
		</div>
	);
}
