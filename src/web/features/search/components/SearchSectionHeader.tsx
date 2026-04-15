type SearchSectionHeaderProps = {
	readonly children: string;
};

export function SearchSectionHeader({ children }: SearchSectionHeaderProps) {
	return <h3 className="zune-label text-[var(--color-text-dim)] mb-3">{children}</h3>;
}
