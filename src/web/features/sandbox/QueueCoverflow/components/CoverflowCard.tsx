/**
 * @module CoverflowCard
 *
 * A single album card in the cover-flow: square artwork with layered shadows.
 * The title/artist caption is overlaid on the bottom of the ACTIVE cover (with
 * a gradient scrim) rather than sitting below the card, so with the overlapping
 * stack the text never spills onto a neighbouring card's art. Non-active cards
 * are pure artwork. Presentational — the stage owns positioning/interaction.
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
    <div style={{ position: "relative", width: "100%" }}>
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
      {active ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            padding: `${size * 0.16}px ${size * 0.06}px ${size * 0.05}px`,
            background:
              "linear-gradient(to top, rgba(0,0,0,0.74) 0%, rgba(0,0,0,0.38) 45%, transparent 100%)",
            textAlign: "center",
            textShadow: "0 1px 4px rgba(0,0,0,0.5)",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              color: "rgba(255,255,255,1)",
              fontSize: Math.max(13, size * 0.08),
              fontWeight: 600,
              lineHeight: 1.2,
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
              color: "rgba(255,255,255,0.72)",
              fontSize: Math.max(9, size * 0.05),
              fontWeight: 500,
              marginTop: size * 0.012,
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
      ) : null}
    </div>
  );
}
