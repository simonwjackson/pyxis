import type { ReactNode } from "react";

type StationListRowRootProps = {
	readonly isActive: boolean;
	readonly onSelect: () => void;
	readonly icon: ReactNode;
	readonly info: ReactNode;
	readonly actions: ReactNode;
};

export function StationListRowRoot({
	isActive,
	onSelect,
	icon,
	info,
	actions,
}: StationListRowRootProps) {
	return (
		<div
			data-active={isActive || undefined}
			className="flex items-center gap-4 p-4 transition-colors group hover:bg-[var(--color-bg-highlight)] data-[active]:bg-[var(--color-bg-highlight)] data-[active]:border data-[active]:border-[var(--color-border-active)]"
		>
			<button
				onClick={onSelect}
				className="flex items-center gap-4 flex-1 min-w-0 text-left"
				type="button"
				aria-label="Play station"
			>
				<div className="w-10 h-10 flex items-center justify-center shrink-0 bg-[var(--color-bg-highlight)]">
					{icon}
				</div>
				<div className="flex-1 min-w-0">{info}</div>
			</button>
			{actions}
		</div>
	);
}
