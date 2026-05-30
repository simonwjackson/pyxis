import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { CollectionGridHeader } from "./CollectionGridHeader";
import { CollectionGridPagination } from "./CollectionGridPagination";
import { CollectionGridSortControls } from "./CollectionGridSortControls";
import type { CollectionGridProps } from "./types";
import { shuffle } from "./utils";

export function CollectionGridRoot<T>({
  title,
  items,
  keyOf,
  renderItem,
  filterFn,
  sortOptions,
  defaultSort,
  paramPrefix,
  trailing,
  headerActions,
  pageSize = 20,
}: CollectionGridProps<T>) {
  const navigate = useNavigate({ from: "/" });
  const search = useSearch({ from: "/" });

  const currentSort =
    paramPrefix === "pl"
      ? (search.pl_sort ?? defaultSort)
      : (search.al_sort ?? defaultSort);
  const currentPage = Math.max(
    1,
    paramPrefix === "pl" ? (search.pl_page ?? 1) : (search.al_page ?? 1),
  );

  const [filterText, setFilterText] = useState("");

  const shuffleSeedRef = useRef(0);
  const prevItemsRef = useRef(items);
  if (prevItemsRef.current !== items) {
    prevItemsRef.current = items;
    shuffleSeedRef.current += 1;
  }

  const setSort = useCallback(
    (sort: string) => {
      if (paramPrefix === "pl") {
        navigate({
          search: (prev) => ({ ...prev, pl_sort: sort, pl_page: 1 }),
          replace: true,
        });
      } else {
        navigate({
          search: (prev) => ({ ...prev, al_sort: sort, al_page: 1 }),
          replace: true,
        });
      }
    },
    [navigate, paramPrefix],
  );

  const setPage = useCallback(
    (page: number) => {
      if (paramPrefix === "pl") {
        navigate({
          search: (prev) => ({ ...prev, pl_page: page }),
          replace: true,
        });
      } else {
        navigate({
          search: (prev) => ({ ...prev, al_page: page }),
          replace: true,
        });
      }
    },
    [navigate, paramPrefix],
  );

  const filtered = useMemo(() => {
    if (!filterText) return items;
    const q = filterText.toLowerCase();
    return items.filter((item) => filterFn(item, q));
  }, [items, filterText, filterFn]);

  const shuffledItems = useMemo(
    () => shuffle(filtered),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered],
  );

  const sorted = useMemo(() => {
    const option = sortOptions.find(
      (candidate) => candidate.key === currentSort,
    );
    if (!option) return [...filtered];
    if (option.comparator === "shuffle") return shuffledItems;
    return [...filtered].sort(option.comparator);
  }, [filtered, shuffledItems, currentSort, sortOptions]);

  const totalItems = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const pageItems = sorted.slice(startIdx, startIdx + pageSize);
  const showPagination = totalPages > 1;
  const isLastPage = safePage === totalPages;

  return (
    <section>
      <CollectionGridHeader
        title={title}
        totalItems={totalItems}
        totalSourceItems={items.length}
        filterText={filterText}
        currentPage={currentPage}
        paramPrefix={paramPrefix}
        headerActions={headerActions}
        onFilterChange={setFilterText}
        onResetPage={() => setPage(1)}
      />

      <CollectionGridSortControls
        sortOptions={sortOptions}
        currentSort={currentSort}
        onSelectSort={setSort}
        onReshuffle={() => {
          shuffleSeedRef.current += 1;
          setPage(1);
        }}
      />

      <div className="lattice-responsive-grid">
        {pageItems.map((item) => (
          <div key={keyOf(item)}>{renderItem(item)}</div>
        ))}
        {isLastPage && trailing ? trailing : null}
      </div>

      {showPagination ? (
        <CollectionGridPagination
          currentPage={safePage}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      ) : null}
    </section>
  );
}
