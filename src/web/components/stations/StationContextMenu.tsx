import { useEffect, useRef } from "react";
import { Info, Pencil, Trash2 } from "lucide-react";

type StationContextMenuProps = {
	readonly allowDelete: boolean;
	readonly allowRename: boolean;
	readonly onDetails: () => void;
	readonly onRename: () => void;
	readonly onDelete: () => void;
	readonly onClose: () => void;
};

export function StationContextMenu({
	allowDelete,
	allowRename,
	onDetails,
	onRename,
	onDelete,
	onClose,
}: StationContextMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			if (
				menuRef.current &&
				!menuRef.current.contains(e.target as Node)
			) {
				onClose();
			}
		}
		function handleEscape(e: KeyboardEvent) {
			if (e.key === "Escape") onClose();
		}
		document.addEventListener("mousedown", handleClickOutside);
		document.addEventListener("keydown", handleEscape);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
			document.removeEventListener("keydown", handleEscape);
		};
	}, [onClose]);

	return (
		<div
			ref={menuRef}
			className="absolute right-0 top-full mt-1 w-48 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 py-1"
		>
			<button
				type="button"
				onClick={onDetails}
				className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700 text-left"
			>
				<Info className="w-4 h-4" />
				Station Details
			</button>
			{allowRename && (
				<button
					type="button"
					onClick={onRename}
					className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700 text-left"
				>
					<Pencil className="w-4 h-4" />
					Rename
				</button>
			)}
			{allowDelete && (
				<>
					<div className="border-t border-zinc-700 my-1" />
					<button
						type="button"
						onClick={onDelete}
						className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-zinc-700 text-left"
					>
						<Trash2 className="w-4 h-4" />
						Delete Station
					</button>
				</>
			)}
		</div>
	);
}
