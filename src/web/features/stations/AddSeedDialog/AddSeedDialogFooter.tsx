type AddSeedDialogFooterProps = {
  readonly onClose: () => void;
};

export function AddSeedDialogFooter({ onClose }: AddSeedDialogFooterProps) {
  return (
    <div className="p-4 border-t border-pyxis-border shrink-0">
      <button
        type="button"
        onClick={onClose}
        className="w-full px-4 py-2 text-sm text-pyxis-muted hover:bg-pyxis-highlight"
      >
        Done
      </button>
    </div>
  );
}
