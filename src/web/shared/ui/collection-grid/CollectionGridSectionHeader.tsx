type CollectionGridSectionHeaderProps = {
  readonly title: string;
};

export function CollectionGridSectionHeader({
  title,
}: CollectionGridSectionHeaderProps) {
  return (
    <div className="flex items-end justify-between mb-4">
      <h2 className="zune-display zune-page-title text-[var(--color-text)]">
        {title}
      </h2>
    </div>
  );
}
