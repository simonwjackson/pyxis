import { Loader2 } from "lucide-react";

export function AddSeedDialogSearching() {
	return (
		<div className="py-8 text-center">
			<Loader2 className="w-5 h-5 animate-spin mx-auto text-[var(--color-text-dim)]" />
		</div>
	);
}
