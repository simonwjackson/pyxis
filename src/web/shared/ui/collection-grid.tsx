/**
 * @module CollectionGrid
 * Reusable paginated grid component with filtering, sorting, and pagination.
 */

import {
	type ReactNode,
	useState,
	useMemo,
	useCallback,
	useRef,
} from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Configuration for a sort option in the collection grid.
 */
export type SortOption<T> = {
	/** Unique key for URL parameter */
	readonly key: string;
	/** Display label */
	readonly label: string;
	/** Icon component to display */
	readonly icon: LucideIcon;
	/** Sort comparator function or "shuffle" for random order */
	readonly comparator: ((a: T, b: T) => number) | "shuffle";
};

/**
 * Props for the CollectionGrid component.
 */
type CollectionGridProps<T> = {
	/** Section title displayed in the header */
	readonly title: string;
	/** Items to display in the grid */
	readonly items: readonly T[];
	/** Function to extract unique key from item */
	readonly keyOf: (item: T) => string;
	/** Function to render each grid item */
	readonly renderItem: (item: T) => ReactNode;
	/** Function to filter items by search query */
	readonly filterFn: (item: T, query: string) => boolean;
	/** Available sort options */
	readonly sortOptions: readonly SortOption<T>[];
	/** Default sort option key */
	readonly defaultSort: string;
	/** URL parameter prefix for sort and page state */
	readonly paramPrefix: string;
	/** Optional content to append at the end of the last page */
	readonly trailing?: ReactNode;
	/** Optional actions to display in the header */
	readonly headerActions?: ReactNode;
	/** Items per page (default: 20) */
	readonly pageSize?: number;
};

function shuffle<T>(array: readonly T[]): T[] {
	const result = [...array];
	for (let i = result.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[result[i], result[j]] = [result[j]!, result[i]!];
	}
	return result;
}

function getPageNumbers(
	current: number,
	total: number,
): (number | "ellipsis")[] {
	if (total <= 7) {
		return Array.from({ length: total }, (_, i) => i + 1);
	}

	const pages: (number | "ellipsis")[] = [1];

	if (current > 3) {
		pages.push("ellipsis");
	}

	const start = Math.max(2, current - 1);
	const end = Math.min(total - 1, current + 1);

	for (let i = start; i <= end; i++) {
		pages.push(i);
	}

	if (current < total - 2) {
		pages.push("ellipsis");
	}

	pages.push(total);

	return pages;
}

export function CollectionGrid<T>({
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
	const navigate = useNavigate();
	const search = useSearch({ strict: false }) as Record<string, unknown>;

	const sortKey = `${paramPrefix}_sort`;
	const pageKey = `${paramPrefix}_page`;

	const currentSort =
		typeof search[sortKey] === "string"
			? (search[sortKey] as string)
			: defaultSort;
	const currentPage =
		typeof search[pageKey] === "string"
			? Math.max(1, Number.parseInt(search[pageKey] as string, 10) || 1)
			: typeof search[pageKey] === "number"
				? Math.max(1, search[pageKey] as number)
				: 1;

	const [filterText, setFilterText] = useState("");

	// Stable shuffle seed: re-shuffle only when items change or user clicks shuffle pill
	const shuffleSeedRef = useRef(0);
	const prevItemsRef = useRef(items);
	if (prevItemsRef.current !== items) {
		prevItemsRef.current = items;
		shuffleSeedRef.current += 1;
	}

	const setSort = useCallback(
		(sort: string) => {
			navigate({
				search: (prev: Record<string, unknown>) => ({
					...prev,
					[sortKey]: sort,
					[pageKey]: "1",
				}),
				replace: true,
			});
		},
		[navigate, sortKey, pageKey],
	);

	const setPage = useCallback(
		(page: number) => {
			navigate({
				search: (prev: Record<string, unknown>) => ({
					...prev,
					[pageKey]: String(page),
				}),
				replace: true,
			});
		},
		[navigate, pageKey],
	);

	const filtered = useMemo(() => {
		if (!filterText) return items;
		const q = filterText.toLowerCase();
		return items.filter((item) => filterFn(item, q));
	}, [items, filterText, filterFn]);

	const shuffledItems = useMemo(
		() => shuffle(filtered),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[filtered, shuffleSeedRef.current],
	);

	const sorted = useMemo(() => {
		const option = sortOptions.find((o) => o.key === currentSort);
		if (!option) return [...filtered];
		if (option.comparator === "shuffle") return shuffledItems;
		return [...filtered].sort(option.comparator);
	}, [filtered, shuffledItems, currentSort, sortOptions]);

	const totalItems = sorted.length;
	const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
	const safePage = Math.min(currentPage, totalPages);
	const startIdx = (safePage - 1) * pageSize;
	const pageItems = sorted.slice(startIdx, startIdx + pageSize);

	const isLastPage = safePage === totalPages;
	const showPagination = totalPages > 1;

	return (
		<section>
			{/* Header */}
			<div className="flex items-center justify-between mb-3">
				<div className="flex items-center gap-2">
					<h2 className="text-lg font-semibold text-[var(--color-text)]">
						{title}
					</h2>
					<span className="bg-[var(--color-bg-highlight)] text-[var(--color-text-dim)] text-xs px-2 py-0.5 rounded-full">
						{filterText
							? `${String(totalItems)} of ${String(items.length)}`
							: String(items.length)}
					</span>
				</div>
				<div className="flex items-center gap-3">
					{headerActions}
					<div className="relative">
						<label htmlFor={`${paramPrefix}-filter`} className="sr-only">
							Filter {title}
						</label>
						<input
							id={`${paramPrefix}-filter`}
							type="text"
							placeholder="Filter..."
							value={filterText}
							onChange={(e) => {
								setFilterText(e.target.value);
								if (currentPage !== 1) {
									setPage(1);
								}
							}}
							className="bg-[var(--color-bg-highlight)] border border-[var(--color-border)] text-[var(--color-text)] py-1.5 pl-8 pr-3 rounded-md text-[13px] w-[180px] outline-none focus:border-[var(--color-border-active)] transition-colors"
						/>
						<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)] w-4 h-4" aria-hidden="true" />
					</div>
				</div>
			</div>

			{/* Sort pills */}
			<div className="flex gap-1.5 mb-4 flex-wrap" role="group" aria-label="Sort options">
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
									shuffleSeedRef.current += 1;
									setPage(1);
								} else {
									setSort(option.key);
								}
							}}
							className={
								isActive
									? "bg-[var(--color-bg-elevated)] border-none text-[var(--color-text)] py-1 px-3.5 rounded-full text-xs font-medium cursor-pointer inline-flex items-center gap-1.5"
									: "bg-transparent border border-[var(--color-border)] text-[var(--color-text-dim)] py-1 px-3.5 rounded-full text-xs cursor-pointer inline-flex items-center gap-1.5 hover:text-[var(--color-text)] hover:border-[var(--color-text-dim)] transition-colors"
							}
						>
							<Icon className="w-[13px] h-[13px]" aria-hidden="true" />
							{option.label}
						</button>
					);
				})}
			</div>

			{/* Grid */}
			<div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
				{pageItems.map((item) => (
					<div key={keyOf(item)}>{renderItem(item)}</div>
				))}
				{isLastPage && trailing ? trailing : null}
			</div>

			{/* Pagination */}
			{showPagination ? (
				<nav className="flex items-center justify-between mt-5 pt-4 border-t border-[var(--color-bg-highlight)]" aria-label="Pagination">
					<span className="text-[var(--color-text-dim)] text-xs opacity-60">
						Page {String(safePage)} of {String(totalPages)}
					</span>
					<div className="flex gap-1 items-center">
						<button
							type="button"
							disabled={safePage === 1}
							onClick={() => setPage(safePage - 1)}
							aria-label="Previous page"
							className="bg-[var(--color-bg-highlight)] border-none w-7 h-7 rounded-md flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-[var(--color-text-dim)] hover:text-[var(--color-text)] transition-colors"
						>
							<ChevronLeft className="w-4 h-4" aria-hidden="true" />
						</button>
						{getPageNumbers(safePage, totalPages).map((p, idx) =>
							p === "ellipsis" ? (
								<span
									key={`ellipsis-${String(idx)}`}
									className="text-[var(--color-border)] text-xs px-0.5"
									aria-hidden="true"
								>
									...
								</span>
							) : (
								<button
									key={p}
									type="button"
									onClick={() => setPage(p)}
									aria-label={`Page ${String(p)}`}
									aria-current={p === safePage ? "page" : undefined}
									className={
										p === safePage
											? "bg-[var(--color-bg-elevated)] border-none text-[var(--color-text)] min-w-[28px] h-7 rounded-md text-xs font-medium"
											: "bg-[var(--color-bg-highlight)] border-none text-[var(--color-text-dim)] min-w-[28px] h-7 rounded-md text-xs cursor-pointer hover:text-[var(--color-text)] transition-colors"
									}
								>
									{String(p)}
								</button>
							),
						)}
						<button
							type="button"
							disabled={safePage === totalPages}
							onClick={() => setPage(safePage + 1)}
							aria-label="Next page"
							className="bg-[var(--color-bg-highlight)] border-none w-7 h-7 rounded-md flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-[var(--color-text-dim)] hover:text-[var(--color-text)] transition-colors"
						>
							<ChevronRight className="w-4 h-4" aria-hidden="true" />
						</button>
					</div>
					<button
						type="button"
						disabled={safePage === totalPages}
						onClick={() => setPage(safePage + 1)}
						className="bg-[var(--color-bg-highlight)] border border-[var(--color-border)] text-[var(--color-text-dim)] py-1 px-3.5 rounded-md text-xs cursor-pointer inline-flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed hover:text-[var(--color-text)] transition-colors"
					>
						Next
						<ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
					</button>
				</nav>
			) : null}
		</section>
	);
}

/**
 * Section header with title.
 */
function SectionHeader({ title }: { readonly title: string }) {
	return (
		<div className="flex items-center justify-between mb-3">
			<div className="flex items-center gap-2">
				<h2 className="text-lg font-semibold text-[var(--color-text)]">
					{title}
				</h2>
			</div>
		</div>
	);
}

/**
 * Props for skeleton loading state.
 */
type SkeletonProps = {
	readonly title: string;
	/** Number of skeleton items to show. Default: 6 */
	readonly count?: number;
};

/**
 * Loading skeleton for CollectionGrid.
 */
function CollectionGridSkeleton({ title, count = 6 }: SkeletonProps) {
	return (
		<section role="status" aria-label={`Loading ${title}`}>
			<SectionHeader title={title} />
			<div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
				{Array.from({ length: count }, (_, i) => (
					<div key={i} aria-hidden="true">
						<div className="aspect-square bg-[var(--color-bg-highlight)] rounded-lg mb-2 animate-pulse" />
						<div className="h-4 bg-[var(--color-bg-highlight)] rounded animate-pulse mb-1 w-3/4" />
						<div className="h-3 bg-[var(--color-bg-highlight)] rounded animate-pulse w-1/2" />
					</div>
				))}
			</div>
		</section>
	);
}

/**
 * Props for empty state.
 */
type EmptyProps = {
	readonly title: string;
	/** Custom message to display. Default: "No items found." */
	readonly message?: string;
};

/**
 * Empty state for CollectionGrid when no items match.
 */
function CollectionGridEmpty({
	title,
	message = "No items found.",
}: EmptyProps) {
	return (
		<section>
			<SectionHeader title={title} />
			<p className="text-sm text-[var(--color-text-dim)]" role="status">{message}</p>
		</section>
	);
}

CollectionGrid.Skeleton = CollectionGridSkeleton;
CollectionGrid.Empty = CollectionGridEmpty;
