type AddSeedDialogFooterProps = {
  readonly onClose: () => void;
};

export function AddSeedDialogFooter({ onClose }: AddSeedDialogFooterProps) {
  return (
    <div className="p-4 border-t border-[var(--color-border)] shrink-0">
      <button
        type="button"
        onClick={onClose}
        className="w-full px-4 py-2 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-bg-highlight)]"
      >
        Done
      </button>
    </div>
  );
}
