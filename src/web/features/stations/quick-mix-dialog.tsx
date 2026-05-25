/**
 * @module QuickMixDialog
 * Dialog for managing which stations are included in QuickMix/Shuffle.
 *
 * Replaces the legacy tRPC `radio.quickMix` mutation hook with an Effect
 * RPC mutation atom (`radio.quickMix.set`). The mutation publishes
 * the {@link RADIO_STATIONS_TAG} reactivity tag so the stations page
 * refreshes after a successful update.
 */

import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { Shuffle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PyxisRpcClient } from "@/web/shared/api/rpcClient";
import { projectQueryResult } from "@/web/shared/effect/projectQueryResult";
import { RADIO_STATIONS_TAG } from "./radioReactivityTags";
import { StationCommandState } from "./StationCommandState";
import type { RadioStation } from "./station-list/types";

const quickMixMutationAtom = PyxisRpcClient.mutation("radio.quickMix.set");
const quickMixReactivityKeys = [RADIO_STATIONS_TAG] as const;

/**
 * Props for the QuickMixDialog component.
 */
type QuickMixDialogProps = {
	readonly stations: readonly RadioStation[];
	readonly onClose: () => void;
};

/**
 * Modal dialog for selecting stations to include in QuickMix (Shuffle) mode.
 * Shows all stations with checkboxes and All/None selection helpers.
 */
export function QuickMixDialog({ stations, onClose }: QuickMixDialogProps) {
	const quickMixStation = stations.find((s) => s.isQuickMix);
	const initialIds = useMemo(
		() => new Set(quickMixStation?.quickMixStationIds ?? []),
		[quickMixStation],
	);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(
		() => new Set(initialIds),
	);
	const result = projectQueryResult(useAtomValue(quickMixMutationAtom));
	const state = StationCommandState.fromResult(result);
	const submit = useAtomSet(quickMixMutationAtom, { mode: "promiseExit" });

	const isSaving = StationCommandState.isSubmitting(state);
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
		void submit({
			payload: { radioIds: [...selectedIds] },
			reactivityKeys: quickMixReactivityKeys,
		}).then((exit) => {
			if (exit._tag === "Success") {
				toast.success("shuffle stations updated");
				onClose();
			} else {
				toast.error("Failed to update shuffle");
			}
		});
	};

	return (
		<div
			className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50"
			onClick={onClose}
			onKeyDown={(e) => {
				if (e.key === "Escape") onClose();
			}}
			role="dialog"
			aria-modal="true"
			aria-labelledby="quickmix-dialog-title"
		>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: dialog content stops backdrop click/keydown propagation; outer div carries the dialog role. */}
			<div
				className="bg-[var(--color-bg)] border border-[var(--color-border)] w-full max-w-md max-h-[70vh] flex flex-col shadow-2xl"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={() => {}}
			>
				<div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
					<div className="flex items-center gap-3">
						<div
							className="w-9 h-9 bg-[var(--color-bg-highlight)] flex items-center justify-center"
							aria-hidden="true"
						>
							<Shuffle className="w-4 h-4 text-[var(--color-secondary)]" />
						</div>
						<div>
							<h2
								id="quickmix-dialog-title"
								className="zune-heading text-2xl text-[var(--color-text)]"
							>
								Manage Shuffle
							</h2>
							<p className="text-sm text-[var(--color-text-dim)]">
								{selectedIds.size} of {nonQuickMixStations.length} stations
								selected
							</p>
						</div>
					</div>
					<div className="flex gap-2">
						<button
							type="button"
							onClick={selectAll}
							className="text-xs text-[var(--color-text-dim)] hover:text-[var(--color-text)] px-2 py-1hover:bg-[var(--color-bg-highlight)]"
						>
							All
						</button>
						<button
							type="button"
							onClick={selectNone}
							className="text-xs text-[var(--color-text-dim)] hover:text-[var(--color-text)] px-2 py-1hover:bg-[var(--color-bg-highlight)]"
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
								className="flex items-center gap-3 p-3 hover:bg-[var(--color-bg-highlight)] cursor-pointer"
							>
								<input
									type="checkbox"
									checked={checked}
									onChange={() => toggle(station.stationId)}
									className="w-4 h-4border-[var(--color-border)] text-[var(--color-secondary)] focus:ring-[var(--color-border-active)] bg-[var(--color-bg-highlight)]"
								/>
								<span
									className={`text-sm ${
										checked
											? "text-[var(--color-text)]"
											: "text-[var(--color-text-muted)]"
									}`}
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
						disabled={isSaving}
						className="px-4 py-2 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-bg-highlight)]"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={handleSave}
						disabled={isSaving}
						className="px-4 py-2 text-sm text-[var(--color-bg)] bg-[var(--color-secondary)] hover:brightness-110 font-medium disabled:opacity-50"
					>
						{isSaving ? "Saving..." : "Save"}
					</button>
				</div>
			</div>
		</div>
	);
}
