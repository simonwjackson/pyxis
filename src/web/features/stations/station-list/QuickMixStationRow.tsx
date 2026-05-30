import { Shuffle } from "lucide-react";
import { StationContextMenuDelete } from "../station-context-menu/StationContextMenuDelete";
import { StationContextMenuDetails } from "../station-context-menu/StationContextMenuDetails";
import { StationContextMenuRename } from "../station-context-menu/StationContextMenuRename";
import { StationListRowActions } from "./StationListRowActions";
import { StationListRowName } from "./StationListRowName";
import { StationListRowRoot } from "./StationListRowRoot";
import { StationListRowSubtitle } from "./StationListRowSubtitle";
import type { RadioStation } from "./types";

type QuickMixStationRowProps = {
  readonly station: RadioStation;
  readonly isActive: boolean;
  readonly onSelect: (station: RadioStation) => void;
  readonly onDetails: (station: RadioStation) => void;
  readonly onRename: (station: RadioStation) => void;
  readonly onDelete: (station: RadioStation) => void;
};

export function QuickMixStationRow({
  station,
  isActive,
  onSelect,
  onDetails,
  onRename,
  onDelete,
}: QuickMixStationRowProps) {
  return (
    <StationListRowRoot
      isActive={isActive}
      onSelect={() => onSelect(station)}
      icon={<Shuffle className="w-5 h-5 text-[var(--color-secondary)]" />}
      info={
        <>
          <StationListRowName isActive={isActive}>
            {station.name}
          </StationListRowName>
          <StationListRowSubtitle className="text-[var(--color-secondary)]">
            QuickMix
          </StationListRowSubtitle>
        </>
      }
      actions={
        <StationListRowActions stationName={station.name}>
          <StationContextMenuDetails onClick={() => onDetails(station)} />
          {station.allowRename ? (
            <StationContextMenuRename onClick={() => onRename(station)} />
          ) : null}
          {station.allowDelete ? (
            <StationContextMenuDelete onClick={() => onDelete(station)} />
          ) : null}
        </StationListRowActions>
      }
    />
  );
}
