/**
 * @module QueueCrate
 *
 * Skeuomorphic queue list explorations: real record materials. Each album is a
 * cardboard sleeve with the art printed on the front, a glossy vinyl disc
 * peeking out, and a cream printed paper label. A clear crate-slot seam divides
 * every album. Neutral/material palette only (charcoal card, black vinyl, cream
 * paper, album art for colour) — no theme tokens. Sizes use container-query
 * units so the crate scales with the frame.
 */

import { useState } from "react";
import type { QueueCoverflowTrack } from "./QueueCoverflowState";

export type QueueCrateVariant =
  | "sleeve"
  | "flip"
  | "spine"
  | "gatefold"
  | "single";

const CARD = "linear-gradient(157deg, #34343a 0%, #26262b 46%, #191919 100%)";
const CARD_EDGE = [
  "inset 0 0 0 1px rgba(255,255,255,0.06)",
  "inset 0 1px 0 rgba(255,255,255,0.14)",
  "inset 0 -2px 3px rgba(0,0,0,0.5)",
].join(", ");
const PAPER = "linear-gradient(180deg, #efe9dc 0%, #e2d9c6 100%)";
const INK = "#221f1a";
const INK_SOFT = "#6b6357";

/** A glossy grooved vinyl disc that fills its parent box (container-scaled). */
function Disc({ color }: { readonly color: string }) {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        borderRadius: "50%",
        background:
          "repeating-radial-gradient(circle at 50% 50%, #191919 0 1.5px, #101010 1.5px 3px)",
        boxShadow:
          "0 4px 12px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.05)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background:
            "linear-gradient(130deg, rgba(255,255,255,0.1) 0%, transparent 38%, transparent 62%, rgba(255,255,255,0.05) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: "34%",
          height: "34%",
          transform: "translate(-50%,-50%)",
          borderRadius: "50%",
          background: color,
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: "14%",
            height: "14%",
            transform: "translate(-50%,-50%)",
            borderRadius: "50%",
            background: "#0c0c0c",
          }}
        />
      </div>
    </div>
  );
}

const rootStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  overflowY: "auto",
  containerType: "size",
  background:
    "radial-gradient(120% 90% at 50% -10%, #232327 0%, #131315 60%, #0c0c0e 100%)",
  fontFamily: "'Urbanist', system-ui, sans-serif",
  WebkitOverflowScrolling: "touch",
};

export function QueueCrate({
  tracks,
  variant,
}: {
  readonly tracks: readonly QueueCoverflowTrack[];
  readonly variant: QueueCrateVariant;
}) {
  const [selected, setSelected] = useState(0);
  const pad =
    variant === "flip" ? "9cqmin 6cqmin 16cqmin" : "5cqmin 5cqmin 8cqmin";

  return (
    <div style={rootStyle}>
      <div style={{ padding: pad }}>
        {tracks.map((track, index) => (
          <Row
            key={track.id}
            track={track}
            index={index}
            variant={variant}
            active={index === selected}
            onSelect={() => setSelected(index)}
          />
        ))}
      </div>
    </div>
  );
}

const pressProps = (onSelect: () => void) => ({
  onClick: onSelect,
  onKeyDown: (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    }
  },
  role: "button" as const,
  tabIndex: 0,
});

/** The album art printed on a cardboard sleeve face, with edge wear + gloss. */
function SleeveArt({
  track,
  radius = "1.4cqmin",
}: {
  readonly track: QueueCoverflowTrack;
  readonly radius?: string;
}) {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        borderRadius: radius,
        background: CARD,
        padding: "1.6cqmin",
        boxShadow: CARD_EDGE,
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          borderRadius: "0.6cqmin",
          overflow: "hidden",
          boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.5)",
        }}
      >
        <img
          src={track.artwork}
          alt={track.title}
          draggable={false}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
        {/* Print keyline + gloss sheen across the printed board */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
            background:
              "linear-gradient(125deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 34%, rgba(255,255,255,0) 70%, rgba(0,0,0,0.16) 100%)",
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
}

/** A cream printed paper label with the album name. */
function PaperLabel({
  track,
  index,
}: {
  readonly track: QueueCoverflowTrack;
  readonly index: number;
}) {
  return (
    <div
      style={{
        background: PAPER,
        borderRadius: "0 0 1.2cqmin 1.2cqmin",
        padding: "3cqmin 4cqmin",
        display: "flex",
        alignItems: "baseline",
        gap: "3cqmin",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -1px 3px rgba(0,0,0,0.12)",
      }}
    >
      <span
        style={{
          color: INK_SOFT,
          fontSize: "3cqmin",
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "0.08em",
        }}
      >
        {String(index + 1).padStart(2, "0")}
      </span>
      <span style={{ minWidth: 0, overflow: "hidden" }}>
        <span
          style={{
            display: "block",
            color: INK,
            fontSize: "3.9cqmin",
            fontWeight: 700,
            letterSpacing: "0.01em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {track.title}
        </span>
        <span
          style={{
            display: "block",
            color: INK_SOFT,
            fontSize: "2.9cqmin",
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {track.artist}
        </span>
      </span>
    </div>
  );
}

function Row({
  track,
  index,
  variant,
  active,
  onSelect,
}: {
  readonly track: QueueCoverflowTrack;
  readonly index: number;
  readonly variant: QueueCrateVariant;
  readonly active: boolean;
  readonly onSelect: () => void;
}) {
  const color = track.dominantColor ?? "#7a7a7a";

  if (variant === "sleeve") {
    return (
      <div
        {...pressProps(onSelect)}
        style={{
          position: "relative",
          marginBottom: "6cqmin",
          paddingTop: active ? "9cqmin" : "0",
          transition: "padding-top 0.35s cubic-bezier(0.25,0.46,0.45,0.94)",
          cursor: "pointer",
        }}
      >
        {/* Disc slides up out of the sleeve on the active album */}
        <div
          style={{
            position: "absolute",
            top: 0,
            right: "12%",
            width: "34cqmin",
            height: "34cqmin",
            transform: active ? "translateY(-46%)" : "translateY(-18%)",
            opacity: active ? 1 : 0,
            transition:
              "opacity 0.4s ease, transform 0.45s cubic-bezier(0.25,0.46,0.45,0.94)",
            zIndex: 0,
          }}
        >
          <Disc color={color} />
        </div>
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ aspectRatio: "1", width: "100%" }}>
            <SleeveArt track={track} radius="1.6cqmin 1.6cqmin 0 0" />
          </div>
          <PaperLabel track={track} index={index} />
        </div>
      </div>
    );
  }

  if (variant === "flip") {
    return (
      <div
        {...pressProps(onSelect)}
        style={{
          position: "relative",
          marginTop: index === 0 ? 0 : "-30cqmin",
          transformStyle: "preserve-3d",
          perspective: "600px",
          cursor: "pointer",
          zIndex: active ? 50 : index,
        }}
      >
        <div
          style={{
            width: "100%",
            aspectRatio: "1",
            transformOrigin: "top center",
            transform: active
              ? "rotateX(0deg) translateZ(20px)"
              : "rotateX(52deg)",
            transition: "transform 0.4s cubic-bezier(0.25,0.46,0.45,0.94)",
            filter: active ? "none" : "brightness(0.72)",
          }}
        >
          <SleeveArt track={track} />
          {/* Spine title printed on the exposed top edge */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              height: "16%",
              padding: "0 4cqmin",
              display: "flex",
              alignItems: "center",
              gap: "3cqmin",
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0) 100%)",
            }}
          >
            <span
              style={{
                color: "rgba(255,255,255,0.95)",
                fontSize: "3.4cqmin",
                fontWeight: 700,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {track.title}
            </span>
            <span
              style={{
                marginLeft: "auto",
                color: "rgba(255,255,255,0.6)",
                fontSize: "2.7cqmin",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                whiteSpace: "nowrap",
              }}
            >
              {track.artist}
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (variant === "spine") {
    return (
      <div
        {...pressProps(onSelect)}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "stretch",
          height: active ? "16cqmin" : "13cqmin",
          marginBottom: "2.4cqmin",
          borderRadius: "1cqmin",
          background: CARD,
          boxShadow: `${CARD_EDGE}, 0 3px 8px rgba(0,0,0,0.4)`,
          transform: active ? "translateX(3cqmin)" : "none",
          transition: "all 0.3s cubic-bezier(0.25,0.46,0.45,0.94)",
          overflow: "hidden",
          cursor: "pointer",
        }}
      >
        {/* Colour band pulled from the art */}
        <div style={{ width: "2.4cqmin", background: color, flexShrink: 0 }} />
        {/* Printed spine title */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 4cqmin",
            gap: "0.6cqmin",
          }}
        >
          <span
            style={{
              color: "rgba(255,255,255,0.95)",
              fontSize: "3.6cqmin",
              fontWeight: 700,
              letterSpacing: "0.02em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {track.title}
          </span>
          <span
            style={{
              color: "rgba(255,255,255,0.5)",
              fontSize: "2.7cqmin",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {track.artist}
          </span>
        </div>
        {/* Disc edge peeking out the right end of the sleeve */}
        <div
          style={{
            position: "relative",
            width: "22cqmin",
            flexShrink: 0,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "34%",
              width: "26cqmin",
              height: "26cqmin",
              transform: "translateY(-50%)",
              borderRadius: "50%",
              background:
                "repeating-radial-gradient(circle at 50% 50%, #191919 0 1.5px, #101010 1.5px 3px)",
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.05)",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: "8cqmin",
                height: "8cqmin",
                transform: "translate(-50%,-50%)",
                borderRadius: "50%",
                background: color,
                boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.15)",
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  if (variant === "gatefold") {
    return (
      <div
        {...pressProps(onSelect)}
        style={{
          display: "flex",
          marginBottom: "5cqmin",
          borderRadius: "1.6cqmin",
          background: CARD,
          padding: "1.6cqmin",
          boxShadow: `${CARD_EDGE}, 0 6px 16px rgba(0,0,0,0.4)`,
          cursor: "pointer",
        }}
      >
        <div style={{ width: "40%", aspectRatio: "1", flexShrink: 0 }}>
          <div
            style={{
              width: "100%",
              height: "100%",
              borderRadius: "0.6cqmin",
              overflow: "hidden",
              boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.5)",
            }}
          >
            <img
              src={track.artwork}
              alt={track.title}
              draggable={false}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        </div>
        {/* Fold seam */}
        <div
          style={{
            width: "1.6cqmin",
            background:
              "linear-gradient(90deg, rgba(0,0,0,0.5), rgba(255,255,255,0.05), rgba(0,0,0,0.5))",
          }}
        />
        {/* Cream liner panel */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            background: PAPER,
            borderRadius: "0.6cqmin",
            padding: "3.5cqmin 4cqmin",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)",
          }}
        >
          <span
            style={{
              color: INK_SOFT,
              fontSize: "2.5cqmin",
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}
          >
            {track.artist}
          </span>
          <span
            style={{
              color: INK,
              fontSize: "5.4cqmin",
              fontWeight: 800,
              lineHeight: 1.05,
              margin: "1cqmin 0 2cqmin",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {track.title}
          </span>
          {[0.86, 0.66, 0.74].map((w, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: static liner rules.
              key={i}
              style={{
                height: "1px",
                width: `${w * 100}%`,
                background: "rgba(34,31,26,0.22)",
                marginTop: "2cqmin",
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  // single — 7" 45 with a die-cut paper sleeve
  return (
    <div
      {...pressProps(onSelect)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "4cqmin",
        marginBottom: "4cqmin",
        padding: "4cqmin",
        borderRadius: "1.4cqmin",
        background: PAPER,
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.6), 0 4px 12px rgba(0,0,0,0.4)",
        cursor: "pointer",
      }}
    >
      {/* Disc with the art as the centre label */}
      <div
        style={{
          position: "relative",
          width: "26cqmin",
          height: "26cqmin",
          flexShrink: 0,
          borderRadius: "50%",
          background:
            "repeating-radial-gradient(circle at 50% 50%, #1b1b1b 0 1.6px, #0f0f0f 1.6px 3.2px)",
          boxShadow:
            "0 3px 10px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.05)",
          transform: active ? "rotate(8deg)" : "none",
          transition: "transform 0.4s ease",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: "58%",
            height: "58%",
            transform: "translate(-50%,-50%)",
            borderRadius: "50%",
            overflow: "hidden",
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.2)",
          }}
        >
          <img
            src={track.artwork}
            alt={track.title}
            draggable={false}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: "9%",
              height: "9%",
              transform: "translate(-50%,-50%)",
              borderRadius: "50%",
              background: "#0c0c0c",
              boxShadow: "0 0 0 2px rgba(239,233,220,0.9)",
            }}
          />
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: "block",
            color: INK_SOFT,
            fontSize: "2.6cqmin",
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          45 rpm · {track.artist}
        </span>
        <span
          style={{
            display: "block",
            color: INK,
            fontSize: "5cqmin",
            fontWeight: 800,
            lineHeight: 1.08,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {track.title}
        </span>
      </div>
    </div>
  );
}
