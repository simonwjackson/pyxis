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
      <div className="lattice-responsive-grid">
        {Array.from(
          { length: count },
          (_, index) => `skeleton-${index + 1}`,
        ).map((key) => (
          <div key={key} aria-hidden="true">
            <div className="aspect-square bg-pyxis-highlight mb-2 animate-pulse" />
            <div className="h-4 bg-pyxis-highlight animate-pulse mb-1 w-3/4" />
            <div className="h-3 bg-pyxis-highlight animate-pulse w-1/2" />
          </div>
        ))}
      </div>
    </section>
  );
}
