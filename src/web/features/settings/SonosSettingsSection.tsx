import type { ApiSonosGroup } from "@shared/api/contracts/sonos.js";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/unstable/reactivity";
import { Check, RefreshCw, Speaker, Unplug, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "../../shared/lib/utils.js";
import {
  refreshSonosMutationAtom,
  SONOS_TOPOLOGY_REACTIVITY_KEY,
  sonosTopologyQueryAtom,
  ungroupSonosRoomMutationAtom,
  updateSonosGroupMutationAtom,
} from "../../shared/output/outputAtoms.js";

export function SonosSettingsSection() {
  const result = useAtomValue(sonosTopologyQueryAtom);
  const topology = AsyncResult.isSuccess(result) ? result.value : null;
  const refresh = useAtomSet(refreshSonosMutationAtom, { mode: "promiseExit" });
  const updateGroup = useAtomSet(updateSonosGroupMutationAtom, {
    mode: "promiseExit",
  });
  const ungroupRoom = useAtomSet(ungroupSonosRoomMutationAtom, {
    mode: "promiseExit",
  });
  const [busy, setBusy] = useState(false);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [desiredMembers, setDesiredMembers] = useState<Set<string>>(new Set());
  const rooms = useMemo(() => {
    const roomMap = new Map(
      topology?.groups.flatMap((group) =>
        group.rooms.map((room) => [room.uuid, room] as const),
      ) ?? [],
    );
    return [...roomMap.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }, [topology]);

  const runRefresh = () => {
    if (busy) return;
    setBusy(true);
    void refresh({
      payload: undefined,
      reactivityKeys: [SONOS_TOPOLOGY_REACTIVITY_KEY],
    }).then((exit) => {
      setBusy(false);
      if (exit._tag === "Success") toast.success("Sonos rooms refreshed");
      else toast.error("Sonos discovery failed");
    });
  };

  const beginEdit = (group: ApiSonosGroup) => {
    setEditingGroup(group.id);
    setDesiredMembers(new Set(group.rooms.map((room) => room.uuid)));
  };

  const saveGroup = (group: ApiSonosGroup) => {
    if (busy) return;
    setBusy(true);
    void updateGroup({
      payload: {
        coordinatorUuid: group.coordinatorUuid,
        memberUuids: [...desiredMembers],
      },
      reactivityKeys: [SONOS_TOPOLOGY_REACTIVITY_KEY],
    }).then((exit) => {
      setBusy(false);
      if (exit._tag === "Success") {
        setEditingGroup(null);
        toast.success("Sonos grouping updated");
      } else toast.error("Couldn't update Sonos grouping");
    });
  };

  const makeStandalone = (roomUuid: string, roomName: string) => {
    if (busy) return;
    setBusy(true);
    void ungroupRoom({
      payload: { roomUuid },
      reactivityKeys: [SONOS_TOPOLOGY_REACTIVITY_KEY],
    }).then((exit) => {
      setBusy(false);
      if (exit._tag === "Success") toast.success(`${roomName} is standalone`);
      else toast.error(`Couldn't ungroup ${roomName}`);
    });
  };

  return (
    <section className="space-y-4" aria-labelledby="sonos-settings-heading">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h3 id="sonos-settings-heading" className="zune-label text-pyxis-muted">
            Sonos rooms
          </h3>
          <p className="text-sm text-pyxis-dim mt-1">
            Select existing rooms and groups as outputs, or change membership here.
          </p>
        </div>
        <button
          type="button"
          onClick={runRefresh}
          disabled={busy || topology?.enabled === false}
          className="min-h-12 min-w-12 px-3 flex items-center justify-center gap-2 border border-pyxis-border hover:border-pyxis-border-active disabled:opacity-40"
          aria-label="Refresh Sonos rooms"
        >
          <RefreshCw className={cn("w-4 h-4", busy && "animate-spin")} />
          <span className="hidden sm:inline text-sm">refresh</span>
        </button>
      </div>

      {result._tag === "Failure" ? (
        <SonosMessage
          title="Sonos discovery failed"
          body="The server could not read the current room topology. Retry when the speakers are reachable."
          onRetry={runRefresh}
          busy={busy}
        />
      ) : null}

      {!topology && result._tag !== "Failure" ? (
        <div className="border border-pyxis-border p-5 text-sm text-pyxis-muted">
          discovering Sonos rooms…
        </div>
      ) : null}

      {topology && !topology.enabled ? (
        <SonosMessage
          title="Sonos is disabled"
          body="Enable Sonos in the Pyxis server configuration to discover rooms."
          busy={busy}
        />
      ) : null}

      {topology?.enabled && !topology.available ? (
        <SonosMessage
          title="No rooms reachable"
          body="Pyxis will keep using configured seed speakers when multicast discovery is unavailable."
          onRetry={runRefresh}
          busy={busy}
        />
      ) : null}

      {topology?.groups.map((group) => {
        const isEditing = editingGroup === group.id;
        return (
          <article key={group.id} className="border border-pyxis-border p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Speaker className="w-5 h-5 text-pyxis-primary" />
                  <h4 className="zune-title text-lg truncate">
                    {group.coordinatorName}
                  </h4>
                  <span className="zune-label text-[0.58rem] text-pyxis-dim">
                    coordinator
                  </span>
                </div>
                <p className="text-sm text-pyxis-muted mt-2">
                  {group.rooms.length === 1
                    ? "standalone room"
                    : `${String(group.rooms.length)} grouped rooms`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => (isEditing ? setEditingGroup(null) : beginEdit(group))}
                disabled={busy || (editingGroup !== null && !isEditing)}
                className="min-h-12 px-4 inline-flex items-center justify-center gap-2 border border-pyxis-border hover:border-pyxis-border-active disabled:opacity-40"
              >
                {isEditing ? <X className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                {isEditing ? "cancel" : "edit members"}
              </button>
            </div>

            {!isEditing ? (
              <ul className="mt-4 divide-y divide-pyxis-border">
                {group.rooms.map((room) => (
                  <li key={room.uuid} className="min-h-14 py-2 flex items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-pyxis-text truncate">{room.name}</span>
                      <span className="block text-xs text-pyxis-dim truncate">
                        {room.model ?? room.address}
                      </span>
                    </span>
                    {group.rooms.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => makeStandalone(room.uuid, room.name)}
                        disabled={busy || editingGroup !== null}
                        className="min-h-12 px-3 inline-flex items-center gap-2 text-sm text-pyxis-muted hover:text-pyxis-text disabled:opacity-40"
                        aria-label={`Make ${room.name} standalone`}
                      >
                        <Unplug className="w-4 h-4" />
                        <span className="hidden sm:inline">standalone</span>
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-5 border-t border-pyxis-border pt-4">
                <p className="text-sm text-pyxis-muted mb-3">
                  Choose every room that should play with {group.coordinatorName}.
                  Group creation and removal are applied together.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {rooms.map((room) => {
                    const coordinator = room.uuid === group.coordinatorUuid;
                    const checked = desiredMembers.has(room.uuid);
                    return (
                      <label
                        key={room.uuid}
                        className={cn(
                          "min-h-12 border px-3 flex items-center gap-3",
                          checked
                            ? "border-pyxis-primary bg-pyxis-highlight"
                            : "border-pyxis-border",
                          coordinator ? "cursor-default" : "cursor-pointer",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={checked}
                          disabled={coordinator || busy}
                          onChange={() => {
                            setDesiredMembers((current) => {
                              const next = new Set(current);
                              if (next.has(room.uuid)) next.delete(room.uuid);
                              else next.add(room.uuid);
                              return next;
                            });
                          }}
                        />
                        <span
                          className={cn(
                            "w-5 h-5 border flex items-center justify-center",
                            checked
                              ? "border-pyxis-primary bg-pyxis-primary"
                              : "border-pyxis-border",
                          )}
                        >
                          {checked ? <Check className="w-3.5 h-3.5 text-white" /> : null}
                        </span>
                        <span className="min-w-0 flex-1 text-sm truncate">{room.name}</span>
                        {coordinator ? (
                          <span className="zune-label text-[0.55rem] text-pyxis-dim">host</span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => saveGroup(group)}
                    disabled={busy}
                    className="min-h-12 px-5 bg-pyxis-primary text-white hover:brightness-110 disabled:opacity-50"
                  >
                    {busy ? "updating…" : "save grouping"}
                  </button>
                </div>
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}

function SonosMessage({
  title,
  body,
  onRetry,
  busy,
}: {
  title: string;
  body: string;
  onRetry?: () => void;
  busy: boolean;
}) {
  return (
    <div className="border border-pyxis-border p-5">
      <p className="zune-title text-pyxis-text">{title}</p>
      <p className="text-sm text-pyxis-muted mt-1">{body}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          disabled={busy}
          className="mt-3 min-h-12 px-4 border border-pyxis-border hover:border-pyxis-border-active disabled:opacity-40"
        >
          retry
        </button>
      ) : null}
    </div>
  );
}
