/**
 * @module DeleteStationDialog
 * Confirmation dialog for deleting a radio station.
 *
 * Replaces the legacy tRPC `radio.delete` mutation hook with an Effect
 * RPC mutation atom (`radio.station.delete`). The mutation publishes the
 * {@link RADIO_STATIONS_TAG} reactivity tag so the stations page query
 * atom refreshes after a successful delete (mirroring the previous
 * `radio.list` invalidation).
 */

import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PyxisRpcClient } from "@/web/shared/api/rpcClient";
import { projectQueryResult } from "@/web/shared/effect/projectQueryResult";
import { RADIO_STATIONS_TAG } from "./radioReactivityTags";
import { StationCommandState } from "./StationCommandState";

const deleteStationMutationAtom = PyxisRpcClient.mutation(
	"radio.station.delete",
);
const deleteReactivityKeys = [RADIO_STATIONS_TAG] as const;

/**
 * Props for the DeleteStationDialog component.
 */
type DeleteStationDialogProps = {
	readonly stationId: string;
	readonly stationName: string;
	readonly onSuccess: () => void;
	readonly onCancel: () => void;
};

/**
 * Confirmation dialog for permanently deleting a radio station.
 * Shows warning message and requires explicit confirmation.
 * Closes on Escape key or cancel button.
 */
export function DeleteStationDialog({
	stationId,
	stationName,
	onSuccess,
	onCancel,
}: DeleteStationDialogProps) {
	const result = projectQueryResult(useAtomValue(deleteStationMutationAtom));
	const state = StationCommandState.fromResult(result);
	const submit = useAtomSet(deleteStationMutationAtom, { mode: "promiseExit" });

	const isDeleting = StationCommandState.isSubmitting(state);

	const handleConfirm = () => {
		void submit({
			payload: { id: stationId },
			reactivityKeys: deleteReactivityKeys,
		}).then((exit) => {
			if (exit._tag === "Success") {
				toast.success("station deleted");
				onSuccess();
			} else {
				toast.error("Failed to delete station");
			}
		});
	};

	return (
		<div
			className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
			onClick={onCancel}
			onKeyDown={(e) => {
				if (e.key === "Escape") onCancel();
			}}
			role="alertdialog"
			aria-modal="true"
			aria-labelledby="delete-dialog-title"
			aria-describedby="delete-dialog-desc"
		>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: dialog content stops backdrop click/keydown propagation; outer div carries the dialog role. */}
			<div
				className="bg-[var(--color-bg)] border border-[var(--color-border)] p-6 max-w-sm w-full shadow-2xl"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={() => {}}
			>
				<div className="flex items-center gap-3 mb-4">
					<div
						className="w-10 h-10 bg-[var(--color-bg-highlight)] flex items-center justify-center"
						aria-hidden="true"
					>
						<Trash2 className="w-5 h-5 text-[var(--color-error)]" />
					</div>
					<h2
						id="delete-dialog-title"
						className="zune-heading text-2xl text-[var(--color-text)]"
					>
						Delete Station
					</h2>
				</div>

				<p className="text-sm text-[var(--color-text-muted)] mb-1">
					are you sure you want to delete
				</p>
				<p className="text-sm font-medium text-[var(--color-text)] mb-4">
					&ldquo;{stationName}&rdquo;?
				</p>
				<p
					id="delete-dialog-desc"
					className="text-xs text-[var(--color-text-dim)] mb-6"
				>
					this action cannot be undone.
				</p>

				<div className="flex gap-3 justify-end">
					<button
						type="button"
						onClick={onCancel}
						disabled={isDeleting}
						className="px-4 py-2 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-bg-highlight)] transition-colors"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={handleConfirm}
						disabled={isDeleting}
						className="px-4 py-2 text-sm text-white bg-[var(--color-error)] hover:brightness-110 transition-colors disabled:opacity-50"
					>
						{isDeleting ? "Deleting..." : "Delete"}
					</button>
				</div>
			</div>
		</div>
	);
}
