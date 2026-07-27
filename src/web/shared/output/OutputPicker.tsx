import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/unstable/reactivity";
import {
  ChevronDown,
  MonitorSpeaker,
  RefreshCw,
  Speaker,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  getWebClientId,
  getWebClientProfile,
} from "../client/clientIdentity.js";
import { cn } from "../lib/utils.js";
import {
  outputStateStreamAtom,
  refreshSonosMutationAtom,
  selectBrowserOutputMutationAtom,
  selectSonosOutputMutationAtom,
  SONOS_TOPOLOGY_REACTIVITY_KEY,
  sonosTopologyQueryAtom,
} from "./outputAtoms.js";

function selectedOutputLabel(
  output: ReturnType<typeof useOutputState>,
  clientId: string,
): string {
  if (!output) return "choose output";
  if (output.type === "none") return "choose output";
  if (output.type === "browser")
    return output.clientId === clientId ? "this browser" : "another browser";
  return output.coordinatorName ?? output.roomName ?? "Sonos";
}

function useOutputState() {
  const result = useAtomValue(outputStateStreamAtom);
  return AsyncResult.isSuccess(result) ? result.value : null;
}

export function OutputPicker({ compact = false }: { compact?: boolean }) {
  const clientId = useMemo(() => getWebClientId(), []);
  const profile = useMemo(() => getWebClientProfile(), []);
  const output = useOutputState();
  const topologyResult = useAtomValue(sonosTopologyQueryAtom);
  const topology = AsyncResult.isSuccess(topologyResult)
    ? topologyResult.value
    : null;
  const selectBrowser = useAtomSet(selectBrowserOutputMutationAtom, {
    mode: "promiseExit",
  });
  const selectSonos = useAtomSet(selectSonosOutputMutationAtom, {
    mode: "promiseExit",
  });
  const refresh = useAtomSet(refreshSonosMutationAtom, {
    mode: "promiseExit",
  });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const label = selectedOutputLabel(output, clientId);
  const selectedUnavailable = output?.type === "sonos" && !output.available;

  const chooseBrowser = () => {
    if (!profile.localOutputAllowed || busy) return;
    setBusy(true);
    void selectBrowser({ payload: { clientId } }).then((exit) => {
      setBusy(false);
      if (exit._tag === "Success") {
        setOpen(false);
        toast.success("playing on this browser");
      } else toast.error("couldn't select browser output");
    });
  };

  const chooseSonos = (roomUuid: string, name: string) => {
    if (busy) return;
    setBusy(true);
    void selectSonos({ payload: { roomUuid } }).then((exit) => {
      setBusy(false);
      if (exit._tag === "Success") {
        setOpen(false);
        toast.success(`playing on ${name}`);
      } else toast.error("couldn't select Sonos output");
    });
  };

  const retry = () => {
    if (busy) return;
    setBusy(true);
    void refresh({
      payload: undefined,
      reactivityKeys: [SONOS_TOPOLOGY_REACTIVITY_KEY],
    }).then((exit) => {
      setBusy(false);
      if (exit._tag !== "Success") toast.error("Sonos discovery failed");
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "min-h-12 flex items-center gap-2 text-left transition-colors",
          compact
            ? "px-3 text-pyxis-muted hover:text-pyxis-text"
            : "w-full px-0 text-pyxis-muted hover:text-pyxis-text",
          selectedUnavailable && "text-pyxis-error",
        )}
        aria-label={`Playback output: ${label}`}
        aria-haspopup="dialog"
      >
        <Speaker className="w-5 h-5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block zune-label text-[0.6rem]">output</span>
          <span className="block truncate text-sm">{label}</span>
        </span>
        <ChevronDown className="w-4 h-4 shrink-0" aria-hidden="true" />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            className="safe-bottom w-full max-w-xl max-h-[85vh] overflow-y-auto border border-pyxis-border bg-pyxis-panel p-5 sm:p-7"
            role="dialog"
            aria-modal="true"
            aria-labelledby="output-picker-title"
          >
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h2
                  id="output-picker-title"
                  className="zune-heading text-3xl text-pyxis-text"
                >
                  play on
                </h2>
                <p className="text-sm text-pyxis-dim mt-1">
                  one shared queue, one active output
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-12 min-w-12 flex items-center justify-center text-pyxis-muted hover:text-pyxis-text"
                aria-label="Close output picker"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-2">
              {profile.localOutputAllowed ? (
                <button
                  type="button"
                  onClick={chooseBrowser}
                  disabled={busy}
                  className={cn(
                    "min-h-14 w-full border px-4 py-3 flex items-center gap-3 text-left disabled:opacity-50",
                    output?.type === "browser" && output.clientId === clientId
                      ? "border-pyxis-primary bg-pyxis-highlight"
                      : "border-pyxis-border hover:border-pyxis-border-active",
                  )}
                >
                  <MonitorSpeaker className="w-5 h-5" />
                  <span className="flex-1">
                    <span className="block zune-title">this browser</span>
                    <span className="block text-xs text-pyxis-dim">
                      local audio on this device
                    </span>
                  </span>
                  {output?.type === "browser" && output.clientId === clientId ? (
                    <span className="zune-label text-pyxis-primary">active</span>
                  ) : null}
                </button>
              ) : (
                <div className="border border-pyxis-border px-4 py-3 text-sm text-pyxis-muted">
                  This wall display is Sonos-only. Local audio is disabled.
                </div>
              )}

              {topology?.groups.map((group) => {
                const active =
                  output?.type === "sonos" &&
                  output.coordinatorUuid === group.coordinatorUuid;
                const roomNames = group.rooms.map((room) => room.name).join(" · ");
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() =>
                      chooseSonos(group.coordinatorUuid, group.coordinatorName)
                    }
                    disabled={busy}
                    className={cn(
                      "min-h-14 w-full border px-4 py-3 flex items-center gap-3 text-left disabled:opacity-50",
                      active
                        ? "border-pyxis-primary bg-pyxis-highlight"
                        : "border-pyxis-border hover:border-pyxis-border-active",
                    )}
                  >
                    <Speaker className="w-5 h-5" />
                    <span className="min-w-0 flex-1">
                      <span className="block zune-title truncate">
                        {group.coordinatorName}
                      </span>
                      <span className="block text-xs text-pyxis-dim truncate">
                        {group.rooms.length === 1
                          ? "standalone room"
                          : roomNames}
                      </span>
                    </span>
                    {active ? (
                      <span
                        className={cn(
                          "zune-label",
                          selectedUnavailable
                            ? "text-pyxis-error"
                            : "text-pyxis-primary",
                        )}
                      >
                        {selectedUnavailable ? "unavailable" : "active"}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {!topology || !topology.enabled || !topology.available ? (
              <div className="mt-5 border border-pyxis-border p-4">
                <p className="text-sm text-pyxis-muted">
                  {!topology
                    ? "Sonos topology is loading or unavailable."
                    : !topology.enabled
                      ? "Sonos output is not enabled on the server."
                      : "No Sonos rooms are reachable."}
                </p>
                <button
                  type="button"
                  onClick={retry}
                  disabled={busy || topology?.enabled === false}
                  className="mt-3 min-h-12 px-4 inline-flex items-center gap-2 border border-pyxis-border hover:border-pyxis-border-active disabled:opacity-40"
                >
                  <RefreshCw className={cn("w-4 h-4", busy && "animate-spin")} />
                  retry discovery
                </button>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}

export function SonosRequiredNotice() {
  const profile = useMemo(() => getWebClientProfile(), []);
  const output = useOutputState();
  if (!profile.sonosRequired || output?.type === "sonos") return null;

  return (
    <div className="mx-4 mt-3 border border-pyxis-primary/60 bg-pyxis-highlight px-4 py-3 sm:mx-8 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1">
        <p className="zune-label text-pyxis-primary">choose a Sonos output</p>
        <p className="text-sm text-pyxis-muted mt-1">
          This display never falls back to its local speakers.
        </p>
      </div>
      <div className="min-w-52">
        <OutputPicker compact />
      </div>
    </div>
  );
}
