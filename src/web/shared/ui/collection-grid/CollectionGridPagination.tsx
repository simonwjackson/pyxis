import { ChevronLeft, ChevronRight } from "lucide-react";
import { getPageNumbers } from "./utils";

type CollectionGridPaginationProps = {
  readonly currentPage: number;
  readonly totalPages: number;
  readonly onPageChange: (page: number) => void;
};

export function CollectionGridPagination({
  currentPage,
  totalPages,
  onPageChange,
}: CollectionGridPaginationProps) {
  return (
    <nav
      className="flex items-center justify-between mt-8 pt-5 border-t border-pyxis-border"
      aria-label="Pagination"
    >
      <span className="zune-label zune-data text-pyxis-dim opacity-60">
        page {String(currentPage)} of {String(totalPages)}
      </span>
      <div className="flex gap-1 items-center">
        <button
          type="button"
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
          aria-label="Previous page"
          className="bg-pyxis-highlight w-7 h-7 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-pyxis-dim hover:text-pyxis-text transition-colors"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        </button>
        {getPageNumbers(currentPage, totalPages).map((page, index) =>
          page === "ellipsis" ? (
            <span
              key={`ellipsis-${String(index)}`}
              className="hidden sm:inline text-pyxis-border text-xs px-0.5"
              aria-hidden="true"
            >
              ...
            </span>
          ) : (
            <button
              key={page}
              type="button"
              onClick={() => onPageChange(page)}
              aria-label={`Page ${String(page)}`}
              aria-current={page === currentPage ? "page" : undefined}
              className={
                page === currentPage
                  ? "hidden sm:inline-flex items-center justify-center bg-pyxis-elevated text-pyxis-text min-w-7 h-7 text-xs font-medium"
                  : "hidden sm:inline-flex items-center justify-center bg-pyxis-highlight text-pyxis-dim min-w-7 h-7 text-xs cursor-pointer hover:text-pyxis-text transition-colors"
              }
            >
              {String(page)}
            </button>
          ),
        )}
        <button
          type="button"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          aria-label="Next page"
          className="bg-pyxis-highlight w-7 h-7 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-pyxis-dim hover:text-pyxis-text transition-colors"
        >
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
