/**
 * @module CoverflowCard
 *
 * A single album card in the cover-flow: square artwork with layered shadows
 * plus the title/artist label. Presentational — the stage owns positioning and
 * interaction; this owns the card's own look at a given size and active state.
 */

import type { QueueCoverflowTrack } from "../QueueCoverflowState";

export function CoverflowCard({
  track,
  size,
  active,
}: {
  readonly track: QueueCoverflowTrack;
  readonly size: number;
  readonly active: boolean;
}) {
  return (
    <>
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
          position: "relative",
        }}
      />
      <div
        style={{
          marginTop: 12,
          textShadow: "0 1px 3px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.15)",
          textAlign: "center",
          padding: "0 4px",
        }}
      >
        <div
          style={{
            color: active ? "rgba(255,255,255,1)" : "rgba(255,255,255,0.9)",
            fontSize: Math.max(11, size * 0.06),
            fontWeight: 600,
            lineHeight: 1.3,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            letterSpacing: "0.01em",
          }}
        >
          {track.title}
        </div>
        <div
          style={{
            color: active ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.45)",
            fontSize: Math.max(9, size * 0.048),
            fontWeight: 500,
            marginTop: 2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {track.artist}
        </div>
      </div>
    </>
  );
}
