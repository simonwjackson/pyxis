/**
 * @module CoverflowCaption
 *
 * The title/artist caption rendered in its own region OUTSIDE the artwork, so
 * covers always stand alone. Two treatments: a centered "plain" caption and a
 * left-aligned "editorial" one with a track counter. Font sizes use container
 * query units so the caption scales with the frame (intrinsic, no media query).
 */

import type { QueueCoverflowTrack } from "../QueueCoverflowState";

export function CoverflowCaption({
  track,
  index,
  count,
  editorial = false,
}: {
  readonly track: QueueCoverflowTrack | undefined;
  readonly index: number;
  readonly count: number;
  readonly editorial?: boolean;
}) {
  if (!track) return null;

  if (editorial) {
    return (
      <div style={{ width: "100%", textAlign: "left" }}>
        <div
          style={{
            color: "rgba(255,255,255,0.6)",
            fontSize: "clamp(9px, 2.6cqmin, 14px)",
            fontWeight: 600,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          {track.artist} · {index + 1} / {count}
        </div>
        <div
          style={{
            color: "rgba(255,255,255,0.96)",
            fontSize: "clamp(20px, 8cqmin, 52px)",
            fontWeight: 300,
            letterSpacing: "-0.02em",
            lineHeight: 1.02,
            textTransform: "lowercase",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {track.title}
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", textAlign: "center" }}>
      <div
        style={{
          color: "rgba(255,255,255,0.98)",
          fontSize: "clamp(15px, 5cqmin, 30px)",
          fontWeight: 600,
          letterSpacing: "0.01em",
          lineHeight: 1.15,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {track.title}
      </div>
      <div
        style={{
          marginTop: "0.35em",
          color: "rgba(255,255,255,0.6)",
          fontSize: "clamp(9px, 2.6cqmin, 15px)",
          fontWeight: 500,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {track.artist}
      </div>
    </div>
  );
}
