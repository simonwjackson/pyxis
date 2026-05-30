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
    <fieldset className="flex gap-1.5 mb-6 flex-wrap">
      <legend className="sr-only">Sort options</legend>
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
                ? "bg-pyxis-elevated text-pyxis-text py-1 px-3.5 text-xs font-medium cursor-pointer inline-flex items-center gap-1.5"
                : "bg-transparent border border-pyxis-border text-pyxis-dim py-1 px-3.5 text-xs cursor-pointer inline-flex items-center gap-1.5 hover:text-pyxis-text hover:border-pyxis-dim transition-colors"
            }
          >
            <Icon className="w-3.5 h-3.5" aria-hidden="true" />
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}
