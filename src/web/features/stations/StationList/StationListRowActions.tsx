import { MoreVertical } from "lucide-react";
import { type ReactNode, useState } from "react";
import { StationContextMenuRoot } from "../StationContextMenu/StationContextMenuRoot";

type StationListRowActionsProps = {
  readonly stationName: string;
  readonly children: ReactNode;
};

export function StationListRowActions({
  stationName,
  children,
}: StationListRowActionsProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="p-1.5 hover:bg-pyxis-highlight opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity md:opacity-0 max-md:opacity-100"
        aria-label={`Actions for ${stationName}`}
      >
        <MoreVertical className="w-4 h-4 text-pyxis-muted" />
      </button>

      {isOpen ? (
        <StationContextMenuRoot onClose={() => setIsOpen(false)}>
          {children}
        </StationContextMenuRoot>
      ) : null}
    </div>
  );
}
