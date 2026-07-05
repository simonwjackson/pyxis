/**
 * @module QueueCoverflowPage
 *
 * Optional Queue cover-flow surface. Reads the real queue edge through the
 * swappable {@link queueCoverflowSourceAtom} and composes a state-specific
 * surface. In the dev lab the Caliper adapter pins a fixture source into that
 * atom, so every state is reachable without changing this surface.
 */

import { useAtomValue } from "@effect/atom-react";
import { QueueCoverflowReady } from "./QueueCoverflowReady";
import { queueCoverflowStateFromResult } from "./QueueCoverflowState";
import { queueCoverflowSourceAtom } from "./queueCoverflowSource";

export function QueueCoverflowPage() {
  const source = useAtomValue(queueCoverflowSourceAtom);
  const result = useAtomValue(source.queueStateAtom);
  const state = queueCoverflowStateFromResult(result);

  switch (state._tag) {
    case "Ready":
      return (
        <QueueCoverflowReady
          tracks={state.tracks}
          initialIndex={state.activeIndex}
        />
      );
    case "Loading":
      return <QueueCoverflowMessage title="Loading queue…" />;
    case "Empty":
      return (
        <QueueCoverflowMessage
          title="Queue is empty"
          detail="Play an album, playlist, or station to fill the queue."
        />
      );
    case "LoadError":
      return (
        <QueueCoverflowMessage
          title="Couldn't load the queue"
          detail="The queue is temporarily unavailable."
        />
      );
    case "Defect":
      return (
        <QueueCoverflowMessage
          title="Something went wrong"
          detail="The queue surface hit an unexpected error."
        />
      );
  }
}

function QueueCoverflowMessage({
  title,
  detail,
}: {
  readonly title: string;
  readonly detail?: string;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: 24,
        textAlign: "center",
        background: "var(--color-bg, #0d0d0d)",
        fontFamily: "'Urbanist', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          color: "var(--color-text, rgba(255,255,255,0.92))",
          fontSize: 18,
          fontWeight: 600,
          letterSpacing: "0.01em",
        }}
      >
        {title}
      </div>
      {detail ? (
        <div
          style={{
            color: "var(--color-text-muted, rgba(255,255,255,0.5))",
            fontSize: 13,
            maxWidth: 260,
            lineHeight: 1.4,
          }}
        >
          {detail}
        </div>
      ) : null}
    </div>
  );
}
