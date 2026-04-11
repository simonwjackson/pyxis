/**
 * @module CollectionGrid
 * Zune-inspired paginated grid with oversized section headers and sharp geometry.
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

export type SortOption<T> = {
	readonly key: string;
	readonly label: string;
	readonly icon: LucideIcon;
	readonly comparator: ((a: T, b: T) => number) | "shuffle";
};

type CollectionGridProps<T> = {
	readonly title: string;
	readonly items: readonly T[];
	readonly keyOf: (item: T) => string;
	readonly renderItem: (item: T) => ReactNode;
	readonly filterFn: (item: T, query: string) => boolean;
	readonly sortOptions: readonly SortOption<T>[];
	readonly defaultSort: string;
	readonly paramPrefix: string;
	readonly trailing?: ReactNode;
	readonly headerActions?: ReactNode;
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

function getPageNumbers(current: number, total: number): (number | "ellipsis")[] {
	if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
	const pages: (number | "ellipsis")[] = [1];
	if (current > 3) pages.push("ellipsis");
	const start = Math.max(2, current - 1);
	const end = Math.min(total - 1, current + 1);
	for (let i = start; i <= end; i++) pages.push(i);
	if (current < total - 2) pages.push("ellipsis");
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
	const navigate = useNavigate({ from: "/" });
	const search = useSearch({ from: "/" });

	const currentSort =
		paramPrefix === "pl"
			? search.pl_sort ?? defaultSort
			: search.al_sort ?? defaultSort;
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
				navigate({ search: (prev) => ({ ...prev, pl_sort: sort, pl_page: 1 }), replace: true });
			} else {
				navigate({ search: (prev) => ({ ...prev, al_sort: sort, al_page: 1 }), replace: true });
			}
		},
		[navigate, paramPrefix],
	);

	const setPage = useCallback(
		(page: number) => {
			if (paramPrefix === "pl") {
				navigate({ search: (prev) => ({ ...prev, pl_page: page }), replace: true });
			} else {
				navigate({ search: (prev) => ({ ...prev, al_page: page }), replace: true });
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
			{/* Zune panoramic header */}
			<div className="flex items-end justify-between mb-5 gap-3 flex-wrap">
				<div className="flex items-baseline gap-4">
					<h2 className="zune-display zune-page-title text-[var(--color-text)]">
						{title}
					</h2>
					<span className="zune-label zune-data text-[var(--color-text-dim)]">
						{filterText
							? `${String(totalItems)} of ${String(items.length)}`
							: String(items.length)}
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
							onChange={(e) => {
								setFilterText(e.target.value);
								if (currentPage !== 1) setPage(1);
							}}
							className="bg-[var(--color-bg-highlight)] border border-[var(--color-border)] text-[var(--color-text)] py-1.5 pl-8 pr-3 text-[13px] w-full sm:w-[180px] outline-none focus:border-[var(--color-border-active)] transition-colors placeholder:text-[var(--color-text-dim)]"
						/>
						<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)] w-4 h-4" aria-hidden="true" />
					</div>
				</div>
			</div>

			{/* Sort pills — sharp, minimal */}
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
									shuffleSeedRef.current += 1;
									setPage(1);
								} else {
									setSort(option.key);
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

			{/* Grid */}
			<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-5">
				{pageItems.map((item) => (
					<div key={keyOf(item)}>{renderItem(item)}</div>
				))}
				{isLastPage && trailing ? trailing : null}
			</div>

			{/* Pagination */}
			{showPagination ? (
				<nav className="flex items-center justify-between mt-8 pt-5 border-t border-[var(--color-border)]" aria-label="Pagination">
					<span className="zune-label zune-data text-[var(--color-text-dim)] opacity-60">
						page {String(safePage)} of {String(totalPages)}
					</span>
					<div className="flex gap-1 items-center">
						<button
							type="button"
							disabled={safePage === 1}
							onClick={() => setPage(safePage - 1)}
							aria-label="Previous page"
							className="bg-[var(--color-bg-highlight)] w-7 h-7 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-[var(--color-text-dim)] hover:text-[var(--color-text)] transition-colors"
						>
							<ChevronLeft className="w-4 h-4" aria-hidden="true" />
						</button>
						{getPageNumbers(safePage, totalPages).map((p, idx) =>
							p === "ellipsis" ? (
								<span key={`ellipsis-${String(idx)}`} className="hidden sm:inline text-[var(--color-border)] text-xs px-0.5" aria-hidden="true">...</span>
							) : (
								<button
									key={p}
									type="button"
									onClick={() => setPage(p)}
									aria-label={`Page ${String(p)}`}
									aria-current={p === safePage ? "page" : undefined}
									className={
										p === safePage
											? "hidden sm:inline-flex items-center justify-center bg-[var(--color-bg-elevated)] text-[var(--color-text)] min-w-[28px] h-7 text-xs font-medium"
											: "hidden sm:inline-flex items-center justify-center bg-[var(--color-bg-highlight)] text-[var(--color-text-dim)] min-w-[28px] h-7 text-xs cursor-pointer hover:text-[var(--color-text)] transition-colors"
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
							className="bg-[var(--color-bg-highlight)] w-7 h-7 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-[var(--color-text-dim)] hover:text-[var(--color-text)] transition-colors"
						>
							<ChevronRight className="w-4 h-4" aria-hidden="true" />
						</button>
					</div>
				</nav>
			) : null}
		</section>
	);
}

function SectionHeader({ title }: { readonly title: string }) {
	return (
		<div className="flex items-end justify-between mb-4">
			<h2 className="zune-display zune-page-title text-[var(--color-text)]">{title}</h2>
		</div>
	);
}

type SkeletonProps = { readonly title: string; readonly count?: number };

function CollectionGridSkeleton({ title, count = 6 }: SkeletonProps) {
	return (
		<section role="status" aria-label={`Loading ${title}`}>
			<SectionHeader title={title} />
			<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-5">
				{Array.from({ length: count }, (_, i) => (
					<div key={i} aria-hidden="true">
						<div className="aspect-square bg-[var(--color-bg-highlight)] mb-2 animate-pulse" />
						<div className="h-4 bg-[var(--color-bg-highlight)] animate-pulse mb-1 w-3/4" />
						<div className="h-3 bg-[var(--color-bg-highlight)] animate-pulse w-1/2" />
					</div>
				))}
			</div>
		</section>
	);
}

type EmptyProps = { readonly title: string; readonly message?: string };

function CollectionGridEmpty({ title, message = "No items found." }: EmptyProps) {
	return (
		<section>
			<SectionHeader title={title} />
			<p className="text-sm text-[var(--color-text-dim)]" role="status">{message}</p>
		</section>
	);
}

CollectionGrid.Skeleton = CollectionGridSkeleton;
CollectionGrid.Empty = CollectionGridEmpty;
