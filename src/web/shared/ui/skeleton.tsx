/**
 * @module Skeleton
 * Loading placeholder components for content that is being fetched.
 */

import { cn } from "../lib/utils";

/**
 * Props for the Skeleton component.
 */
type SkeletonProps = {
	readonly className?: string;
};

/**
 * Animated placeholder for loading content.
 * @param props - Skeleton props including optional className
 */
export function Skeleton({ className }: SkeletonProps) {
	return (
		<div
			className={cn(
				"animate-pulse rounded-md bg-[var(--color-bg-highlight)]",
				className,
			)}
			aria-hidden="true"
		/>
	);
}

/**
 * Skeleton loading state for the station list view.
 */
export function StationListSkeleton() {
	return (
		<div className="space-y-2 p-4" role="status" aria-label="Loading stations">
			<Skeleton className="h-6 w-32 mb-4" />
			<Skeleton className="h-10 w-full mb-4" />
			{Array.from({ length: 6 }).map((_, i) => (
				<div key={i} className="flex items-center gap-3 p-3">
					<Skeleton className="w-10 h-10 rounded" />
					<Skeleton className="h-5 flex-1" />
				</div>
			))}
		</div>
	);
}

/**
 * Skeleton loading state for the now playing view.
 */
export function NowPlayingSkeleton() {
	return (
		<div className="flex flex-col items-center justify-center p-8 space-y-6" role="status" aria-label="Loading now playing">
			<Skeleton className="w-64 h-64 md:w-80 md:h-80 rounded-2xl" />
			<div className="text-center space-y-2 w-full max-w-md">
				<Skeleton className="h-8 w-48 mx-auto" />
				<Skeleton className="h-5 w-32 mx-auto" />
				<Skeleton className="h-4 w-24 mx-auto" />
			</div>
			<Skeleton className="h-1 w-full max-w-md rounded-full" />
			<div className="flex items-center gap-6">
				<Skeleton className="w-12 h-12 rounded-full" />
				<Skeleton className="w-14 h-14 rounded-full" />
				<Skeleton className="w-12 h-12 rounded-full" />
				<Skeleton className="w-12 h-12 rounded-full" />
			</div>
		</div>
	);
}
