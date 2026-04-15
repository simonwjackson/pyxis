import { Info } from "lucide-react";

type StationContextMenuDetailsProps = {
	readonly onClick: () => void;
};

export function StationContextMenuDetails({
	onClick,
}: StationContextMenuDetailsProps) {
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
