import { CollectionGridSectionHeader } from "./CollectionGridSectionHeader";

type CollectionGridSkeletonProps = {
	readonly title: string;
	readonly count?: number;
};

export function CollectionGridSkeleton({
	title,
	count = 6,
}: CollectionGridSkeletonProps) {
	return (
		<section role="status" aria-label={`Loading ${title}`}>
			<CollectionGridSectionHeader title={title} />
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
