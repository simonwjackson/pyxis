import { Radio } from "lucide-react";
import { StationContextMenuDelete } from "../StationContextMenu/StationContextMenuDelete";
import { StationContextMenuDetails } from "../StationContextMenu/StationContextMenuDetails";
import { StationContextMenuRename } from "../StationContextMenu/StationContextMenuRename";
import { StationListRowActions } from "./StationListRowActions";
import { StationListRowName } from "./StationListRowName";
import { StationListRowRoot } from "./StationListRowRoot";
import { StationListRowSubtitle } from "./StationListRowSubtitle";
import type { RadioStation } from "./types";

type RadioStationRowProps = {
  readonly station: RadioStation;
  readonly isActive: boolean;
  readonly onSelect: (station: RadioStation) => void;
  readonly onDetails: (station: RadioStation) => void;
  readonly onRename: (station: RadioStation) => void;
  readonly onDelete: (station: RadioStation) => void;
};

export function RadioStationRow({
  station,
  isActive,
  onSelect,
  onDetails,
  onRename,
  onDelete,
}: RadioStationRowProps) {
  return (
    <StationListRowRoot
      isActive={isActive}
      onSelect={() => onSelect(station)}
      icon={
        <Radio
          data-active={isActive || undefined}
          className="w-5 h-5 text-[var(--color-text-dim)] data-[active]:text-[var(--color-primary)]"
        />
      }
      info={
        <>
          <StationListRowName isActive={isActive}>
            {station.name}
          </StationListRowName>
          {isActive ? (
            <StationListRowSubtitle className="text-[var(--color-primary)]">
              Now playing
            </StationListRowSubtitle>
          ) : null}
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
