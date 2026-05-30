/**
 * @module RenameStationDialog
 * Dialog for renaming a radio station.
 *
 * Replaces the legacy tRPC `radio.rename` mutation hook with an Effect
 * RPC mutation atom (`radio.station.rename`). The mutation publishes the
 * {@link RADIO_STATIONS_TAG} reactivity tag so the stations page refreshes
 * after a successful rename.
 */

import { PyxisRpcClient } from "@app/shared/api/rpcClient";
import { projectQueryResult } from "@app/shared/effect/projectQueryResult";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { RADIO_STATIONS_TAG } from "./radioReactivityTags";
import { StationCommandState } from "./StationCommandState";

const renameStationMutationAtom = PyxisRpcClient.mutation(
  "radio.station.rename",
);
const renameReactivityKeys = [RADIO_STATIONS_TAG] as const;

/**
 * Props for the RenameStationDialog component.
 */
type RenameStationDialogProps = {
  readonly stationId: string;
  readonly stationName: string;
  readonly onSuccess: () => void;
  readonly onCancel: () => void;
};

/**
 * Modal dialog for renaming a radio station.
 * Shows input field with current name pre-selected.
 * Closes on Escape key or cancel button.
 */
export function RenameStationDialog({
  stationId,
  stationName,
  onSuccess,
  onCancel,
}: RenameStationDialogProps) {
  const [name, setName] = useState(stationName);
  const inputRef = useRef<HTMLInputElement>(null);
  const result = projectQueryResult(useAtomValue(renameStationMutationAtom));
  const state = StationCommandState.fromResult(result);
  const submit = useAtomSet(renameStationMutationAtom, { mode: "promiseExit" });

  const isRenaming = StationCommandState.isSubmitting(state);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === stationName) return;
    void submit({
      payload: { id: stationId, name: trimmed },
      reactivityKeys: renameReactivityKeys,
    }).then((exit) => {
      if (exit._tag === "Success") {
        toast.success("station renamed");
        onSuccess();
      } else {
        toast.error("Failed to rename station");
      }
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onCancel}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rename-dialog-title"
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: dialog content stops backdrop click/keydown propagation; outer div carries the dialog role. */}
      <div
        className="bg-pyxis-bg border border-pyxis-border p-6 max-w-sm w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={() => {}}
      >
        <h2
          id="rename-dialog-title"
          className="zune-heading text-2xl text-pyxis-text mb-4"
        >
          Rename Station
        </h2>

        <form onSubmit={handleSubmit}>
          <label
            htmlFor="station-name"
            className="block text-sm text-pyxis-muted mb-1"
          >
            Station name
          </label>
          <input
            ref={inputRef}
            id="station-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isRenaming}
            className="w-full px-3 py-2 bg-pyxis-highlight border border-pyxis-border text-sm text-pyxis-text focus:outline-none focus:ring-2 focus:ring-pyxis-border-active mb-6"
          />

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onCancel}
              disabled={isRenaming}
              className="px-4 py-2 text-sm text-pyxis-muted hover:bg-pyxis-highlight transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                isRenaming || !name.trim() || name.trim() === stationName
              }
              className="px-4 py-2 text-sm text-pyxis-bg bg-pyxis-primary hover:brightness-110 transition-colors disabled:opacity-50"
            >
              {isRenaming ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
