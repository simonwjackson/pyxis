import type { SortOption } from "./types";

type CollectionGridSortControlsProps<T> = {
	readonly sortOptions: readonly SortOption<T>[];
	readonly currentSort: string;
	readonly onSelectSort: (sort: string) => void;
	readonly onReshuffle: () => void;
};

export function CollectionGridSortControls<T>({
	sortOptions,
	currentSort,
	onSelectSort,
	onReshuffle,
}: CollectionGridSortControlsProps<T>) {
	return (
		<div className="flex gap-1.5 mb-6 flex-wrap" role="group" aria-label="Sort options">
			{sortOptions.map((option) => {
				const Icon = option.icon;
				const isActive = currentSort === option.key;
				return (
					<button
						key={option.key}
						type="button"
						aria-pressed={isActive}
						onClick={() => {
							if (option.comparator === "shuffle" && isActive) {
								onReshuffle();
							} else {
								onSelectSort(option.key);
							}
						}}
						className={
							isActive
								? "bg-[var(--color-bg-elevated)] text-[var(--color-text)] py-1 px-3.5 text-xs font-medium cursor-pointer inline-flex items-center gap-1.5"
								: "bg-transparent border border-[var(--color-border)] text-[var(--color-text-dim)] py-1 px-3.5 text-xs cursor-pointer inline-flex items-center gap-1.5 hover:text-[var(--color-text)] hover:border-[var(--color-text-dim)] transition-colors"
						}
					>
						<Icon className="w-[13px] h-[13px]" aria-hidden="true" />
						{option.label}
					</button>
				);
			})}
		</div>
	);
}
