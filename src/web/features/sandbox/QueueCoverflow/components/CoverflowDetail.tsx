/**
 * @module CoverflowDetail
 *
 * The expanded detail assembly for the active track: album cover with the
 * spinning vinyl + tonearm sliding out behind it, and the title/artist below.
 * Presentational — the surface owns the dismiss overlay; `open` drives the
 * slide/spin/fade transitions.
 */

import type { QueueCoverflowTrack } from "../QueueCoverflowState";
import type { CoverflowAxis } from "../queueCoverflowGeometry";
import { Tonearm } from "./Tonearm";
import { VinylRecord } from "./VinylRecord";

export function CoverflowDetail({
  track,
  detailSize,
  open,
  axis = "x",
}: {
  readonly track: QueueCoverflowTrack | undefined;
  readonly detailSize: number;
  readonly open: boolean;
  /** Landscape slides the record out to the side; portrait slides it down, so
   * the turntable always fits the frame. Driven by the container aspect. */
  readonly axis?: CoverflowAxis;
}) {
  const vinylSize = detailSize;
  const vertical = axis === "y";
  // The vinyl's resting (closed) and engaged (open) offsets along the slide axis.
  const slideClosed = detailSize * 0.2;
  const slideOpen = detailSize * 0.52;
  const crossCentre = (detailSize - vinylSize) / 2;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        transform: open ? "scale(1)" : "scale(0.85)",
        transition: "transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
      }}
    >
      {/* Assembly — grows along the slide axis to make room for the record */}
      <div
        style={{
          position: "relative",
          width: vertical ? detailSize : detailSize + vinylSize * 0.55,
          height: vertical ? detailSize + vinylSize * 0.55 : detailSize,
        }}
      >
        {/* Vinyl — behind album, slides out to the side or down */}
        <div
          style={{
            position: "absolute",
            top: vertical ? (open ? slideOpen : slideClosed) : crossCentre,
            left: vertical ? crossCentre : open ? slideOpen : slideClosed,
            transition:
              "top 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94), left 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
            zIndex: 1,
          }}
        >
          <VinylRecord
            size={vinylSize}
            color={track?.dominantColor ?? "#666"}
            title={track?.title ?? ""}
            artist={track?.artist ?? ""}
            spinning={open}
          />
          <Tonearm size={vinylSize} engaged={open} />
        </div>

        {/* Album cover — on top */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: detailSize,
            height: detailSize,
            zIndex: 2,
          }}
        >
          <img
            src={track?.artwork}
            alt={track?.title}
            draggable={false}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
              boxShadow: [
                "0 1px 2px rgba(0,0,0,0.12)",
                "0 4px 8px rgba(0,0,0,0.10)",
                "0 12px 24px rgba(0,0,0,0.14)",
                "0 24px 48px rgba(0,0,0,0.08)",
              ].join(", "),
            }}
          />
        </div>
      </div>

      {/* Track info */}
      <div
        style={{
          marginTop: 48,
          textAlign: "center",
          textShadow: "0 1px 3px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.15)",
          opacity: open ? 1 : 0,
          transform: open ? "translateY(0)" : "translateY(12px)",
          transition: "opacity 0.5s ease 0.25s, transform 0.5s ease 0.25s",
        }}
      >
        <div
          style={{
            color: "rgba(255,255,255,0.95)",
            fontSize: Math.max(16, detailSize * 0.055),
            fontWeight: 700,
            letterSpacing: "0.01em",
            lineHeight: 1.2,
          }}
        >
          {track?.title}
        </div>
        <div
          style={{
            color: "rgba(255,255,255,0.5)",
            fontSize: Math.max(12, detailSize * 0.038),
            fontWeight: 500,
            marginTop: 6,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          {track?.artist}
        </div>
      </div>
    </div>
  );
}
