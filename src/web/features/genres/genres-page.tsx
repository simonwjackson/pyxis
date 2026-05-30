/**
 * @module GenresPage
 * Page for browsing and creating stations from genre categories.
 *
 * Reads `radio.genres.list` through the Effect RPC client and adapts the
 * AsyncResult into the pure {@link GenresState} ADT before rendering.
 * Station creation publishes {@link RADIO_STATIONS_TAG} so the stations
 * surface refreshes after a new station is created (mirroring the legacy
 * `utils.radio.list.invalidate()`).
 */

import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PyxisRpcClient } from "@/web/shared/api/rpcClient";
import { projectQueryResult } from "@/web/shared/effect/projectQueryResult";
import { Button } from "@/web/shared/ui/button";
import { Spinner } from "@/web/shared/ui/spinner";
import { RADIO_STATIONS_TAG } from "../stations/radioReactivityTags";
import { GenresState } from "./GenresState";

const genresQueryAtom = PyxisRpcClient.query("radio.genres.list", undefined);

const createStationMutationAtom = PyxisRpcClient.mutation(
  "radio.station.create",
);
const createStationReactivityKeys = [RADIO_STATIONS_TAG] as const;

/**
 * Genre stations browser with expandable categories.
 * Shows Pandora genre categories and allows creating new stations.
 */
export function GenresPage() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const result = projectQueryResult(useAtomValue(genresQueryAtom));
  const state = GenresState.fromResult(result);
  const createStation = useAtomSet(createStationMutationAtom, {
    mode: "promiseExit",
  });

  const handleCreateStation = (musicToken: string) => {
    void createStation({
      payload: { musicToken },
      reactivityKeys: createStationReactivityKeys,
    }).then((exit) => {
      if (exit._tag === "Success") {
        toast.success("Station created");
      } else {
        toast.error("Failed to create station");
      }
    });
  };

  if (state._tag === "Loading") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (state._tag === "LoadError" || state._tag === "Defect") {
    return (
      <div className="flex-1 px-4 sm:px-8 py-10">
        <p className="text-[var(--color-error)]">failed to load genres</p>
      </div>
    );
  }

  const categories = state._tag === "Ready" ? state.categories : [];

  return (
    <div className="flex-1 px-4 sm:px-8 py-10 space-y-6">
      <h2 className="zune-display zune-page-title text-[var(--color-text)]">
        genres
      </h2>
      <div className="space-y-1">
        {categories.map((cat) => (
          <div key={cat.categoryName}>
            <button
              onClick={() =>
                setExpanded(
                  expanded === cat.categoryName ? null : cat.categoryName,
                )
              }
              className="w-full text-left px-3 py-2.5 hover:bg-[var(--color-bg-highlight)] text-[var(--color-text)] font-medium flex items-center justify-between transition-colors"
              type="button"
            >
              <span>{cat.categoryName}</span>
              {expanded === cat.categoryName ? (
                <ChevronDown className="w-4 h-4 text-[var(--color-text-dim)]" />
              ) : (
                <ChevronRight className="w-4 h-4 text-[var(--color-text-dim)]" />
              )}
            </button>
            {expanded === cat.categoryName && (
              <ul className="ml-6 space-y-1 mt-2">
                {cat.stations.map((station) => (
                  <li
                    key={station.stationToken}
                    className="flex items-center justify-between px-3 py-2 hover:bg-[var(--color-bg-highlight)]"
                  >
                    <span className="text-sm text-[var(--color-text-muted)]">
                      {station.stationName}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1"
                      onClick={() => handleCreateStation(station.stationToken)}
                    >
                      <Plus className="w-3 h-3" />
                      Add
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
