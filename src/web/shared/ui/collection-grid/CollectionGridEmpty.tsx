import { CollectionGridSectionHeader } from "./CollectionGridSectionHeader";

type CollectionGridEmptyProps = {
	readonly title: string;
	readonly message?: string;
};

export function CollectionGridEmpty({
	title,
	message = "No items found.",
}: CollectionGridEmptyProps) {
	return (
		<section>
			<CollectionGridSectionHeader title={title} />
			<p className="text-sm text-[var(--color-text-dim)]" role="status">
				{message}
			</p>
		</section>
	);
}
