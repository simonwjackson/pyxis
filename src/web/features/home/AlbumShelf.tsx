import {
  ArrowDownAZ,
  ArrowDownWideNarrow,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  Search,
  Shuffle,
  User,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { AlbumCard } from "./AlbumCard";
import type { AlbumData } from "./types";

function shuffleAlbums(albums: readonly AlbumData[]): AlbumData[] {
  const result = [...albums];
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!];
  }
  return result;
}

function getPageNumbers(
  currentPage: number,
  totalPages: number,
): (number | "ellipsis")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const pages: (number | "ellipsis")[] = [1];
  if (currentPage > 3) pages.push("ellipsis");
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);
  for (let page = start; page <= end; page++) pages.push(page);
  if (currentPage < totalPages - 2) pages.push("ellipsis");
  pages.push(totalPages);
  return pages;
}

type AlbumSortOption = {
  readonly key: string;
  readonly label: string;
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly comparator: ((a: AlbumData, b: AlbumData) => number) | "shuffle";
};

const ALBUM_SORT_OPTIONS: readonly AlbumSortOption[] = [
  { key: "shuffle", label: "Shuffle", icon: Shuffle, comparator: "shuffle" },
  {
    key: "az",
    label: "A → Z",
    icon: ArrowDownAZ,
    comparator: (a, b) => a.title.localeCompare(b.title),
  },
  {
    key: "artist",
    label: "By Artist",
    icon: User,
    comparator: (a, b) => {
      const artistCompare = a.artist.localeCompare(b.artist);
      return artistCompare !== 0
        ? artistCompare
        : a.title.localeCompare(b.title);
    },
  },
  {
    key: "newest",
    label: "Newest",
    icon: ArrowDownWideNarrow,
    comparator: (a, b) => {
      if (a.year === null && b.year === null) return 0;
      if (a.year === null) return 1;
      if (b.year === null) return -1;
      return b.year - a.year;
    },
  },
  {
    key: "recent",
    label: "Recently Added",
    icon: Clock,
    comparator: (a, b) => b.placementUpdatedAt - a.placementUpdatedAt,
  },
] as const;

const HOT_SORT_OPTIONS: readonly AlbumSortOption[] = [
  {
    key: "hot",
    label: "Hot Rank",
    icon: Flame,
    comparator: (a, b) => {
      const aRank = a.hotRank ?? Number.MAX_SAFE_INTEGER;
      const bRank = b.hotRank ?? Number.MAX_SAFE_INTEGER;
      if (aRank !== bRank) return aRank - bRank;
      return b.placementUpdatedAt - a.placementUpdatedAt;
    },
  },
  ...ALBUM_SORT_OPTIONS,
] as const;

type AlbumShelfProps = {
  readonly title: string;
  readonly albums: readonly AlbumData[];
  readonly emptyMessage: string;
  readonly headerAction?: ReactNode;
  readonly trailing?: ReactNode;
  readonly sortOptions?: readonly AlbumSortOption[];
  readonly defaultSort?: string;
  readonly pageSize?: number;
};

export function AlbumShelf({
  title,
  albums,
  emptyMessage,
  headerAction,
  trailing,
  sortOptions = ALBUM_SORT_OPTIONS,
  defaultSort = "recent",
  pageSize = 10,
}: AlbumShelfProps) {
  const [filterText, setFilterText] = useState("");
  const [currentSort, setCurrentSort] = useState(defaultSort);
  const [currentPage, setCurrentPage] = useState(1);

  const filteredAlbums = useMemo(() => {
    const normalizedFilter = filterText.trim().toLowerCase();
    if (!normalizedFilter) return albums;
    return albums.filter((album) => {
      return (
        album.title.toLowerCase().includes(normalizedFilter) ||
        album.artist.toLowerCase().includes(normalizedFilter)
      );
    });
  }, [albums, filterText]);

  const sortedAlbums = useMemo(() => {
    const selected =
      sortOptions.find((option) => option.key === currentSort) ??
      sortOptions[0];
    if (!selected) return [...filteredAlbums];
    if (selected.comparator === "shuffle") {
      return shuffleAlbums(filteredAlbums);
    }
    return [...filteredAlbums].sort(selected.comparator);
  }, [currentSort, filteredAlbums, sortOptions]);

  const totalPages = Math.max(1, Math.ceil(sortedAlbums.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const pageAlbums = sortedAlbums.slice(startIndex, startIndex + pageSize);
  const showPagination = totalPages > 1;

  return (
    <section>
      <div className="flex items-end justify-between mb-5 gap-4 flex-wrap">
        <div className="flex items-baseline gap-4">
          <h2 className="zune-display zune-page-title text-[var(--color-text)]">
            {title}
          </h2>
          <span className="zune-label zune-data text-[var(--color-text-dim)]">
            {filterText
              ? `${String(sortedAlbums.length)} of ${String(albums.length)}`
              : String(albums.length)}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-wrap w-full sm:w-auto">
          {headerAction}
          <div className="relative w-full sm:w-auto">
            <label htmlFor={`${title}-filter`} className="sr-only">
              Filter {title}
            </label>
            <input
              id={`${title}-filter`}
              type="text"
              placeholder="filter..."
              value={filterText}
              onChange={(event) => {
                setFilterText(event.target.value);
                setCurrentPage(1);
              }}
              className="bg-[var(--color-bg-highlight)] border border-[var(--color-border)] text-[var(--color-text)] py-1.5 pl-8 pr-3 text-[13px] w-full sm:w-[180px] outline-none focus:border-[var(--color-border-active)] transition-colors placeholder:text-[var(--color-text-dim)]"
            />
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)] w-4 h-4"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>

      <div
        className="flex gap-1.5 mb-6 flex-wrap"
        role="group"
        aria-label={`${title} sort options`}
      >
        {sortOptions.map((option) => {
          const Icon = option.icon;
          const isActive = currentSort === option.key;
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={isActive}
              onClick={() => {
                setCurrentSort(option.key);
                setCurrentPage(1);
              }}
              className={
                isActive
                  ? "bg-[var(--color-bg-elevated)] text-[var(--color-text)] py-1 px-3.5 text-xs font-medium inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                  : "bg-transparent border border-[var(--color-border)] text-[var(--color-text-dim)] py-1 px-3.5 text-xs inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap hover:text-[var(--color-text)] hover:border-[var(--color-text-dim)] transition-colors"
              }
            >
              <Icon className="w-[13px] h-[13px]" aria-hidden="true" />
              {option.label}
            </button>
          );
        })}
      </div>

      {sortedAlbums.length === 0 ? (
        <p className="text-sm text-[var(--color-text-dim)]">{emptyMessage}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-5">
            {pageAlbums.map((album) => (
              <div key={album.id}>
                <AlbumCard album={album} />
              </div>
            ))}
            {safePage === totalPages ? trailing : null}
          </div>

          {showPagination ? (
            <nav
              className="flex items-center justify-between mt-8 pt-5 border-t border-[var(--color-border)]"
              aria-label={`${title} pagination`}
            >
              <span className="zune-label zune-data text-[var(--color-text-dim)] opacity-60">
                page {String(safePage)} of {String(totalPages)}
              </span>
              <div className="flex gap-1 items-center">
                <button
                  type="button"
                  disabled={safePage === 1}
                  onClick={() => setCurrentPage(safePage - 1)}
                  className="bg-[var(--color-bg-highlight)] w-7 h-7 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed text-[var(--color-text-dim)] hover:text-[var(--color-text)] transition-colors"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                </button>
                {getPageNumbers(safePage, totalPages).map((page, index) =>
                  page === "ellipsis" ? (
                    <span
                      key={`ellipsis-${String(index)}`}
                      className="hidden sm:inline text-[var(--color-border)] text-xs px-0.5"
                      aria-hidden="true"
                    >
                      ...
                    </span>
                  ) : (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setCurrentPage(page)}
                      className={
                        page === safePage
                          ? "hidden sm:inline-flex items-center justify-center bg-[var(--color-bg-elevated)] text-[var(--color-text)] min-w-[28px] h-7 text-xs font-medium"
                          : "hidden sm:inline-flex items-center justify-center bg-[var(--color-bg-highlight)] text-[var(--color-text-dim)] min-w-[28px] h-7 text-xs hover:text-[var(--color-text)] transition-colors"
                      }
                      aria-current={page === safePage ? "page" : undefined}
                    >
                      {String(page)}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  disabled={safePage === totalPages}
                  onClick={() => setCurrentPage(safePage + 1)}
                  className="bg-[var(--color-bg-highlight)] w-7 h-7 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed text-[var(--color-text-dim)] hover:text-[var(--color-text)] transition-colors"
                  aria-label="Next page"
                >
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </nav>
          ) : null}
        </>
      )}
    </section>
  );
}

export { HOT_SORT_OPTIONS };
