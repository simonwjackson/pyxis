/**
 * @module Skeleton
 * Loading placeholder components — sharp Zune geometry.
 */

import { cn } from "../lib/utils";

type SkeletonProps = {
	readonly className?: string;
};

export function Skeleton({ className }: SkeletonProps) {
	return (
		<div
			className={cn(
				"animate-pulse bg-[var(--color-bg-highlight)]",
				className,
			)}
			aria-hidden="true"
		/>
	);
}

export function StationListSkeleton() {
	return (
		<div className="space-y-2 p-6" role="status" aria-label="Loading stations">
			<Skeleton className="h-8 w-32 mb-6" />
			<Skeleton className="h-10 w-full mb-4" />
			{Array.from({ length: 6 }).map((_, i) => (
				<div key={i} className="flex items-center gap-3 p-3">
					<Skeleton className="w-10 h-10" />
					<Skeleton className="h-5 flex-1" />
				</div>
			))}
		</div>
	);
}

export function NowPlayingSkeleton() {
	return (
		<div className="flex flex-col items-center justify-center p-8 space-y-6" role="status" aria-label="Loading now playing">
			<Skeleton className="w-64 h-64 md:w-80 md:h-80" />
			<div className="text-center space-y-2 w-full max-w-md">
				<Skeleton className="h-8 w-48 mx-auto" />
				<Skeleton className="h-5 w-32 mx-auto" />
				<Skeleton className="h-4 w-24 mx-auto" />
			</div>
			<Skeleton className="h-1 w-full max-w-md" />
			<div className="flex items-center gap-6">
				<Skeleton className="w-12 h-12" />
				<Skeleton className="w-14 h-14" />
				<Skeleton className="w-12 h-12" />
			</div>
		</div>
	);
}
