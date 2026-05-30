type AddSeedDialogEmptyProps = {
  readonly query: string;
};

export function AddSeedDialogEmpty({ query }: AddSeedDialogEmptyProps) {
  return (
    <div className="py-8 text-center text-[var(--color-text-dim)] text-sm">
      No results found for &ldquo;{query}&rdquo;
    </div>
  );
}
