import type { RefObject } from "react";
import { Search } from "lucide-react";

type AddSeedDialogHeaderProps = {
	readonly inputRef: RefObject<HTMLInputElement | null>;
	readonly query: string;
	readonly onQueryChange: (value: string) => void;
};

export function AddSeedDialogHeader({
	inputRef,
	query,
	onQueryChange,
}: AddSeedDialogHeaderProps) {
	return (
		<div className="p-4 border-b border-[var(--color-border)] shrink-0">
			<h2 id="add-seed-dialog-title" className="zune-heading text-2xl text-[var(--color-text)] mb-3">
				Add Seed
			</h2>
			<div className="relative">
				<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-dim)]" aria-hidden="true" />
				<label htmlFor="add-seed-search" className="sr-only">Search artists or songs</label>
				<input
					ref={inputRef}
					id="add-seed-search"
					type="text"
					placeholder="search artists or songs..."
					value={query}
					onChange={(event) => onQueryChange(event.target.value)}
					className="w-full pl-9 pr-4 py-2 bg-[var(--color-bg-highlight)] border border-[var(--color-border)] text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-active)]"
				/>
			</div>
		</div>
	);
}
