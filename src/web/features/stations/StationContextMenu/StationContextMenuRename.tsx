import { Pencil } from "lucide-react";

type StationContextMenuRenameProps = {
  readonly onClick: () => void;
};

export function StationContextMenuRename({
  onClick,
}: StationContextMenuRenameProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-pyxis-muted hover:bg-pyxis-highlight text-left"
    >
      <Pencil className="w-4 h-4" />
      Rename
    </button>
  );
}
