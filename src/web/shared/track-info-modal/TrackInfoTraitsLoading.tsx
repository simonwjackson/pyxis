import { Loader2 } from "lucide-react";

export function TrackInfoTraitsLoading() {
	return (
		<div className="flex items-center gap-2 py-3 text-[var(--color-text-dim)] text-sm">
			<Loader2 className="w-4 h-4 animate-spin" />
			Loading traits...
		</div>
	);
}
