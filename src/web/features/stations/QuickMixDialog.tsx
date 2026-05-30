/**
 * @module QuickMixDialog
 * Dialog for managing which stations are included in QuickMix/Shuffle.
 *
 * Replaces the legacy tRPC `radio.quickMix` mutation hook with an Effect
 * RPC mutation atom (`radio.quickMix.set`). The mutation publishes
 * the {@link RADIO_STATIONS_TAG} reactivity tag so the stations page
 * refreshes after a successful update.
 */

import { PyxisRpcClient } from "@app/shared/api/rpcClient";
import { projectQueryResult } from "@app/shared/effect/projectQueryResult";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { Shuffle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { RADIO_STATIONS_TAG } from "./radioReactivityTags";
import { StationCommandState } from "./StationCommandState";
import type { RadioStation } from "./StationList/types";

const quickMixMutationAtom = PyxisRpcClient.mutation("radio.quickMix.set");
const quickMixReactivityKeys = [RADIO_STATIONS_TAG] as const;

/**
 * Props for the QuickMixDialog component.
 */
type QuickMixDialogProps = {
  readonly stations: readonly RadioStation[];
  readonly onClose: () => void;
};

/**
 * Modal dialog for selecting stations to include in QuickMix (Shuffle) mode.
 * Shows all stations with checkboxes and All/None selection helpers.
 */
export function QuickMixDialog({ stations, onClose }: QuickMixDialogProps) {
  const quickMixStation = stations.find((s) => s.isQuickMix);
  const initialIds = useMemo(
    () => new Set(quickMixStation?.quickMixStationIds ?? []),
    [quickMixStation],
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initialIds),
  );
  const result = projectQueryResult(useAtomValue(quickMixMutationAtom));
  const state = StationCommandState.fromResult(result);
  const submit = useAtomSet(quickMixMutationAtom, { mode: "promiseExit" });

  const isSaving = StationCommandState.isSubmitting(state);
  const nonQuickMixStations = stations.filter((s) => !s.isQuickMix);

  const toggle = (stationId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(stationId)) {
        next.delete(stationId);
      } else {
        next.add(stationId);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(nonQuickMixStations.map((s) => s.stationId)));
  };

  const selectNone = () => {
    setSelectedIds(new Set());
  };

  const handleSave = () => {
    void submit({
      payload: { radioIds: [...selectedIds] },
      reactivityKeys: quickMixReactivityKeys,
    }).then((exit) => {
      if (exit._tag === "Success") {
        toast.success("shuffle stations updated");
        onClose();
      } else {
        toast.error("Failed to update shuffle");
      }
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="quickmix-dialog-title"
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: dialog content stops backdrop click/keydown propagation; outer div carries the dialog role. */}
      <div
        className="bg-pyxis-bg border border-pyxis-border w-full max-w-md max-h-[70dvh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={() => {}}
      >
        <div className="p-4 border-b border-pyxis-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 bg-pyxis-highlight flex items-center justify-center"
              aria-hidden="true"
            >
              <Shuffle className="w-4 h-4 text-pyxis-secondary" />
            </div>
            <div>
              <h2
                id="quickmix-dialog-title"
                className="zune-heading text-2xl text-pyxis-text"
              >
                Manage Shuffle
              </h2>
              <p className="text-sm text-pyxis-dim">
                {selectedIds.size} of {nonQuickMixStations.length} stations
                selected
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="text-xs text-pyxis-dim hover:text-pyxis-text px-2 py-1hover:bg-pyxis-highlight"
            >
              All
            </button>
            <button
              type="button"
              onClick={selectNone}
              className="text-xs text-pyxis-dim hover:text-pyxis-text px-2 py-1hover:bg-pyxis-highlight"
            >
              None
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {nonQuickMixStations.map((station) => {
            const checked = selectedIds.has(station.stationId);
            return (
              <label
                key={station.stationId}
                className="flex items-center gap-3 p-3 hover:bg-pyxis-highlight cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(station.stationId)}
                  className="w-4 h-4 border-pyxis-border text-pyxis-secondary focus:ring-pyxis-border-active bg-pyxis-highlight"
                />
                <span
                  className={`text-sm ${
                    checked ? "text-pyxis-text" : "text-pyxis-muted"
                  }`}
                >
                  {station.name}
                </span>
              </label>
            );
          })}
        </div>

        <div className="p-4 border-t border-pyxis-border flex gap-3 justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 text-sm text-pyxis-muted hover:bg-pyxis-highlight"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 text-sm text-pyxis-bg bg-pyxis-secondary hover:brightness-110 font-medium disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
