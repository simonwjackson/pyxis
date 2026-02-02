import { type ReactNode, useEffect, useRef } from "react";
import { Info, Pencil, Trash2 } from "lucide-react";

type StationContextMenuProps = {
	readonly onClose: () => void;
	readonly children: ReactNode;
};

export function StationContextMenu({
	onClose,
	children,
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
			className="absolute right-0 top-full mt-1 w-48 bg-[var(--color-bg-highlight)] border border-[var(--color-border)] rounded-lg shadow-xl z-50 py-1"
		>
			{children}
		</div>
	);
}

function Details({ onClick }: { readonly onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-bg-highlight)] text-left"
		>
			<Info className="w-4 h-4" />
			Station Details
		</button>
	);
}

function Rename({ onClick }: { readonly onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-bg-highlight)] text-left"
		>
			<Pencil className="w-4 h-4" />
			Rename
		</button>
	);
}

function Delete({ onClick }: { readonly onClick: () => void }) {
	return (
		<>
			<div className="border-t border-[var(--color-border)] my-1" />
			<button
				type="button"
				onClick={onClick}
				className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-error)] hover:bg-[var(--color-bg-highlight)] text-left"
			>
				<Trash2 className="w-4 h-4" />
				Delete Station
			</button>
		</>
	);
}

StationContextMenu.Details = Details;
StationContextMenu.Rename = Rename;
StationContextMenu.Delete = Delete;
