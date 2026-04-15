import { type ReactNode, useEffect, useRef } from "react";

type StationContextMenuRootProps = {
	readonly onClose: () => void;
	readonly children: ReactNode;
};

export function StationContextMenuRoot({
	onClose,
	children,
}: StationContextMenuRootProps) {
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
				onClose();
			}
		}

		function handleEscape(event: KeyboardEvent) {
			if (event.key === "Escape") onClose();
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
			className="absolute right-0 top-full mt-1 w-48 bg-[var(--color-bg-highlight)] border border-[var(--color-border)] shadow-xl z-50 py-1"
		>
			{children}
		</div>
	);
}
