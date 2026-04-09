/**
 * @module DeleteStationDialog
 * Confirmation dialog for deleting a radio station.
 */

import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/web/shared/lib/trpc";

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
	const utils = trpc.useUtils();
	const deleteMutation = trpc.radio.delete.useMutation({
		onSuccess() {
			utils.radio.list.invalidate();
			toast.success("station deleted");
			onSuccess();
		},
		onError(err) {
			toast.error(`Failed to delete station: ${err.message}`);
		},
	});

	const isDeleting = deleteMutation.isPending;
	const handleConfirm = () => deleteMutation.mutate({ id: stationId });

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
			<div
				className="bg-[var(--color-bg)] border border-[var(--color-border)] p-6 max-w-sm w-full shadow-2xl"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={() => {}}
			>
				<div className="flex items-center gap-3 mb-4">
					<div className="w-10 h-10 bg-[var(--color-bg-highlight)] flex items-center justify-center" aria-hidden="true">
						<Trash2 className="w-5 h-5 text-[var(--color-error)]" />
					</div>
					<h2 id="delete-dialog-title" className="zune-heading text-2xl text-[var(--color-text)]">
						Delete Station
					</h2>
				</div>

				<p className="text-sm text-[var(--color-text-muted)] mb-1">
					are you sure you want to delete
				</p>
				<p className="text-sm font-medium text-[var(--color-text)] mb-4">
					&ldquo;{stationName}&rdquo;?
				</p>
				<p id="delete-dialog-desc" className="text-xs text-[var(--color-text-dim)] mb-6">
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
