/**
 * @module CoverflowCard
 *
 * A single album cover in the cover-flow: square artwork only, with layered
 * shadows that deepen for the active cover. The artwork always stands alone —
 * no text is ever drawn over it; the surface renders the title/artist in a
 * separate caption region. Presentational — the stage owns positioning.
 */

import type { QueueCoverflowTrack } from "../QueueCoverflowState";

export function CoverflowCard({
  track,
  active,
}: {
  readonly track: QueueCoverflowTrack;
  readonly active: boolean;
}) {
  return (
    <img
      src={track.artwork}
      alt={track.title}
      draggable={false}
      style={{
        width: "100%",
        aspectRatio: "1",
        objectFit: "cover",
        borderRadius: 0,
        boxShadow: active
          ? [
              "0 2px 4px rgba(0,0,0,0.15)",
              "0 8px 16px rgba(0,0,0,0.14)",
              "0 20px 40px rgba(0,0,0,0.18)",
              "0 32px 64px rgba(0,0,0,0.10)",
            ].join(", ")
          : [
              "0 1px 2px rgba(0,0,0,0.12)",
              "0 4px 8px rgba(0,0,0,0.10)",
              "0 12px 24px rgba(0,0,0,0.14)",
              "0 24px 48px rgba(0,0,0,0.08)",
            ].join(", "),
        transition: "box-shadow 0.4s ease",
        display: "block",
      }}
    />
  );
}
