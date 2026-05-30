/**
 * @module HistoryPage
 * Page displaying the user's listen history (played tracks log).
 *
 * Reads through the Effect RPC client and adapts the AsyncResult into the
 * pure {@link HistoryState} ADT before rendering. The page composes
 * state-specific components rather than branching on raw runtime fields.
 */

import { useAtomValue } from "@effect/atom-react";
import { useMemo, useState } from "react";
import { PyxisRpcClient } from "@app/shared/api/rpcClient";
import { projectQueryResult } from "@app/shared/effect/projectQueryResult";
import { Button } from "@app/shared/ui/button";
import { Spinner } from "@app/shared/ui/spinner";
import type { ApiListenLogEntry } from "../../../api/contracts/listenLog.js";
import { HistoryState } from "./HistoryState";

const PAGE_SIZE = 50;

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function HistoryPage() {
  const [offset, setOffset] = useState(0);
  const historyAtom = useMemo(
    () =>
      PyxisRpcClient.query("listenLog.entries.list", {
        limit: PAGE_SIZE,
        offset,
      }),
    [offset],
  );
  const result = useAtomValue(historyAtom);
  const state = HistoryState.fromResult(projectQueryResult(result), offset);

  return (
    <div className="flex-1 px-4 sm:px-8 py-10 space-y-6">
      <h2 className="zune-display zune-page-title text-[var(--color-text)]">
        history
      </h2>

      <HistoryBody state={state} />

      <HistoryPagination
        state={state}
        onPrev={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
        onNext={() => setOffset(offset + PAGE_SIZE)}
      />
    </div>
  );
}

function HistoryBody({ state }: { state: HistoryState }) {
  if (state._tag === "Loading") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (state._tag === "Empty") {
    if (state.offset !== 0) return null;
    return (
      <div className="py-16 text-[var(--color-text-dim)]">
        <p className="zune-display text-4xl text-[var(--color-text-dim)]/40 mb-4">
          no history
        </p>
        <p className="text-sm">
          songs you listen to for 30+ seconds will appear here.
        </p>
      </div>
    );
  }
  if (state._tag === "LoadError" || state._tag === "Defect") {
    return (
      <div className="py-16 text-[var(--color-text-dim)]">
        <p className="text-sm">couldn't load history.</p>
      </div>
    );
  }
  return <HistoryList entries={state.entries} />;
}

function HistoryList({ entries }: { entries: readonly ApiListenLogEntry[] }) {
  return (
    <ul className="space-y-1">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 p-3 hover:bg-[var(--color-bg-highlight)]"
        >
          <div className="flex-1 min-w-0">
            <p className="zune-list-title text-[var(--color-text)] truncate">
              {entry.title}
            </p>
            <p className="zune-eyebrow text-[var(--color-text-dim)]">
              {entry.artist}
              {entry.album ? ` \u2014 ${entry.album}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
            <span className="zune-eyebrow px-1.5 py-0.5 bg-[var(--color-bg-highlight)] text-[var(--color-text-muted)]">
              {entry.source}
            </span>
            <span className="zune-data text-xs text-[var(--color-text-dim)]">
              {formatRelativeTime(new Date(entry.listenedAt))}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function HistoryPagination({
  state,
  onPrev,
  onNext,
}: {
  state: HistoryState;
  onPrev: () => void;
  onNext: () => void;
}) {
  const offset =
    state._tag === "Ready" || state._tag === "Empty" ? state.offset : 0;
  const showNext = state._tag === "Ready" && state.entries.length === PAGE_SIZE;
  const showPrev = offset > 0;
  if (!showPrev && !showNext) return null;
  return (
    <div className="flex items-center justify-between">
      {showPrev && (
        <Button variant="ghost" size="sm" onClick={onPrev}>
          Previous
        </Button>
      )}
      {showNext && (
        <Button variant="ghost" size="sm" className="ml-auto" onClick={onNext}>
          Older
        </Button>
      )}
    </div>
  );
}
