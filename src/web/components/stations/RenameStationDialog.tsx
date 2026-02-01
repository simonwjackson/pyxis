import { useState, useEffect, useRef } from "react";

type RenameStationDialogProps = {
	readonly stationName: string;
	readonly isRenaming: boolean;
	readonly onConfirm: (newName: string) => void;
	readonly onCancel: () => void;
};

export function RenameStationDialog({
	stationName,
	isRenaming,
	onConfirm,
	onCancel,
}: RenameStationDialogProps) {
	const [name, setName] = useState(stationName);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		inputRef.current?.select();
	}, []);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const trimmed = name.trim();
		if (trimmed && trimmed !== stationName) {
			onConfirm(trimmed);
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
				className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-sm w-full shadow-2xl"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={() => {}}
			>
				<h2 className="text-lg font-semibold text-zinc-100 mb-4">
					Rename Station
				</h2>

				<form onSubmit={handleSubmit}>
					<label
						htmlFor="station-name"
						className="block text-sm text-zinc-400 mb-1"
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
						className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 mb-6"
						autoFocus
					/>

					<div className="flex gap-3 justify-end">
						<button
							type="button"
							onClick={onCancel}
							disabled={isRenaming}
							className="px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors"
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
							className="px-4 py-2 text-sm text-zinc-900 bg-cyan-500 hover:bg-cyan-400 rounded-lg transition-colors disabled:opacity-50"
						>
							{isRenaming ? "Saving..." : "Save"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
