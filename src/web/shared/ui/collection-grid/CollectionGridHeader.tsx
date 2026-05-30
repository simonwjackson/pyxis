import { Search } from "lucide-react";
import type { ReactNode } from "react";

type CollectionGridHeaderProps = {
  readonly title: string;
  readonly totalItems: number;
  readonly totalSourceItems: number;
  readonly filterText: string;
  readonly currentPage: number;
  readonly paramPrefix: string;
  readonly headerActions?: ReactNode;
  readonly onFilterChange: (value: string) => void;
  readonly onResetPage: () => void;
};

export function CollectionGridHeader({
  title,
  totalItems,
  totalSourceItems,
  filterText,
  currentPage,
  paramPrefix,
  headerActions,
  onFilterChange,
  onResetPage,
}: CollectionGridHeaderProps) {
  return (
    <div className="flex items-end justify-between mb-5 gap-3 flex-wrap">
      <div className="flex items-baseline gap-4">
        <h2 className="zune-display zune-page-title text-pyxis-text">
          {title}
        </h2>
        <span className="zune-label zune-data text-pyxis-dim">
          {filterText
            ? `${String(totalItems)} of ${String(totalSourceItems)}`
            : String(totalSourceItems)}
        </span>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        {headerActions}
        <div className="relative w-full sm:w-auto">
          <label htmlFor={`${paramPrefix}-filter`} className="sr-only">
            Filter {title}
          </label>
          <input
            id={`${paramPrefix}-filter`}
            type="text"
            placeholder="filter..."
            value={filterText}
            onChange={(event) => {
              onFilterChange(event.target.value);
              if (currentPage !== 1) onResetPage();
            }}
            className="bg-pyxis-highlight border border-pyxis-border text-pyxis-text py-1.5 pl-8 pr-3 text-ui-xs w-full sm:w-44 outline-none focus:border-pyxis-border-active transition-colors placeholder:text-pyxis-dim"
          />
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-pyxis-dim w-4 h-4"
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  );
}
