/**
 * @module StationList
 * List component for displaying and interacting with radio stations.
 */

import { QuickMixStationRow } from "./StationList/QuickMixStationRow";
import { RadioStationRow } from "./StationList/RadioStationRow";
import type { RadioStation } from "./StationList/types";

/**
 * Props for the StationList component.
 */
type StationListProps = {
  readonly stations: readonly RadioStation[];
  readonly currentStationId?: string | undefined;
  readonly onSelect: (station: RadioStation) => void;
  readonly onDetails: (station: RadioStation) => void;
  readonly onRename: (station: RadioStation) => void;
  readonly onDelete: (station: RadioStation) => void;
};

/**
 * List of radio stations with selection and context menu actions.
 * Displays stations with play, rename, delete, and details options.
 *
 * @param props - Station list props including handlers for user actions
 */
export function StationList({
  stations,
  currentStationId,
  onSelect,
  onDetails,
  onRename,
  onDelete,
}: StationListProps) {
  if (stations.length === 0) {
    return (
      <p className="text-pyxis-dim text-sm py-4 text-center">
        No stations found.
      </p>
    );
  }

  return (
    <ul className="space-y-1">
      {stations.map((station) => {
        const isActive = station.id === currentStationId;
        const rowProps = {
          station,
          isActive,
          onSelect,
          onDetails,
          onRename,
          onDelete,
        };

        return (
          <li key={station.stationId}>
            {station.isQuickMix ? (
              <QuickMixStationRow {...rowProps} />
            ) : (
              <RadioStationRow {...rowProps} />
            )}
          </li>
        );
      })}
    </ul>
  );
}
