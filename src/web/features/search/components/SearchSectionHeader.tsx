type SearchSectionHeaderProps = {
  readonly children: string;
};

export function SearchSectionHeader({ children }: SearchSectionHeaderProps) {
  return <h3 className="zune-label text-pyxis-dim mb-3">{children}</h3>;
}
