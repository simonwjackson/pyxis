import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export type SortOption<T> = {
	readonly key: string;
	readonly label: string;
	readonly icon: LucideIcon;
	readonly comparator: ((a: T, b: T) => number) | "shuffle";
};

export type CollectionGridProps<T> = {
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
