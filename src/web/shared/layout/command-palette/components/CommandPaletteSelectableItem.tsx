import type { ReactNode } from "react";

type CommandPaletteSelectableItemProps = {
	readonly selected: boolean;
	readonly onClick: () => void;
	readonly onMouseEnter: () => void;
	readonly children: ReactNode;
};

export function CommandPaletteSelectableItem({
	selected,
	onClick,
	onMouseEnter,
	children,
}: CommandPaletteSelectableItemProps) {
	return (
		<button
			type="button"
			data-selected={selected}
			className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
				selected
					? "bg-[var(--color-bg-highlight)]"
					: "hover:bg-[var(--color-bg-highlight)]"
			}`}
			onClick={onClick}
			onMouseEnter={onMouseEnter}
		>
			{children}
		</button>
	);
}
