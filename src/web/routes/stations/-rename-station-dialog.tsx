import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { trpc } from "@/web/shared/lib/trpc";

type RenameStationDialogProps = {
	readonly stationId: string;
	readonly stationName: string;
	readonly onSuccess: () => void;
	readonly onCancel: () => void;
};

export function RenameStationDialog({
	stationId,
	stationName,
	onSuccess,
	onCancel,
}: RenameStationDialogProps) {
	const [name, setName] = useState(stationName);
	const inputRef = useRef<HTMLInputElement>(null);
	const utils = trpc.useUtils();
	const renameMutation = trpc.radio.rename.useMutation({
		onSuccess() {
			utils.radio.list.invalidate();
			toast.success("Station renamed");
			onSuccess();
		},
		onError(err) {
			toast.error(`Failed to rename station: ${err.message}`);
		},
	});

	const isRenaming = renameMutation.isPending;

	useEffect(() => {
		inputRef.current?.select();
	}, []);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const trimmed = name.trim();
		if (trimmed && trimmed !== stationName) {
			renameMutation.mutate({ id: stationId, name: trimmed });
		}
	};

	return (
		<div
			className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
			onClick={onCancel}
			onKeyDown={(e) => {
				if (e.key === "Escape") onCancel();
			}}
		>
			<div
				className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl p-6 max-w-sm w-full shadow-2xl"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={() => {}}
			>
				<h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">
					Rename Station
				</h2>

				<form onSubmit={handleSubmit}>
					<label
						htmlFor="station-name"
						className="block text-sm text-[var(--color-text-muted)] mb-1"
					>
						Station name
					</label>
					<input
						ref={inputRef}
						id="station-name"
						type="text"
						value={name}
						onChange={(e) => setName(e.target.value)}
						disabled={isRenaming}
						className="w-full px-3 py-2 bg-[var(--color-bg-highlight)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-border-active)] mb-6"
						autoFocus
					/>

					<div className="flex gap-3 justify-end">
						<button
							type="button"
							onClick={onCancel}
							disabled={isRenaming}
							className="px-4 py-2 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-bg-highlight)] rounded-lg transition-colors"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={
								isRenaming ||
								!name.trim() ||
								name.trim() === stationName
							}
							className="px-4 py-2 text-sm text-[var(--color-bg)] bg-[var(--color-primary)] hover:brightness-110 rounded-lg transition-colors disabled:opacity-50"
						>
							{isRenaming ? "Saving..." : "Save"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
