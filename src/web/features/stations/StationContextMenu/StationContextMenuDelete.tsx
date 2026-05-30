import { Trash2 } from "lucide-react";

type StationContextMenuDeleteProps = {
  readonly onClick: () => void;
};

export function StationContextMenuDelete({
  onClick,
}: StationContextMenuDeleteProps) {
  return (
    <>
      <div className="border-t border-pyxis-border my-1" />
      <button
        type="button"
        onClick={onClick}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-pyxis-error hover:bg-pyxis-highlight text-left"
      >
        <Trash2 className="w-4 h-4" />
        Delete Station
      </button>
    </>
  );
}
