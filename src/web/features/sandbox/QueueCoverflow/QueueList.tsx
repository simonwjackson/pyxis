/**
 * @module QueueList
 *
 * Stylized list explorations of the queue where each album sits in a "pocket"
 * (a record sleeve): a clear seam line separates every album, and the name sits
 * beside or below the cover. Five variants for comparison as templates. Sizes
 * use container-query units so the list scales with the frame (intrinsic).
 */

import { useState } from "react";
import type { QueueCoverflowTrack } from "./QueueCoverflowState";

export type QueueListVariant =
  | "sleeve"
  | "beside"
  | "tab"
  | "crate"
  | "editorial";

const rootStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  overflowY: "auto",
  containerType: "size",
  background: "var(--color-bg, #0d0d10)",
  color: "var(--color-text, #ede8e3)",
  fontFamily: "'Urbanist', system-ui, sans-serif",
  WebkitOverflowScrolling: "touch",
};

const seam = "1px solid rgba(255,255,255,0.12)";

export function QueueList({
  tracks,
  variant,
}: {
  readonly tracks: readonly QueueCoverflowTrack[];
  readonly variant: QueueListVariant;
}) {
  const [selected, setSelected] = useState(0);

  return (
    <div style={rootStyle}>
      <div style={{ padding: variant === "crate" ? "3cqmin 0 12cqmin" : 0 }}>
        {tracks.map((track, index) => (
          <Row
            key={track.id}
            track={track}
            index={index}
            count={tracks.length}
            variant={variant}
            active={index === selected}
            onSelect={() => setSelected(index)}
          />
        ))}
      </div>
    </div>
  );
}

function Row({
  track,
  index,
  count,
  variant,
  active,
  onSelect,
}: {
  readonly track: QueueCoverflowTrack;
  readonly index: number;
  readonly count: number;
  readonly variant: QueueListVariant;
  readonly active: boolean;
  readonly onSelect: () => void;
}) {
  const common: React.CSSProperties = {
    cursor: "pointer",
    position: "relative",
    background: active ? "rgba(255,255,255,0.05)" : "transparent",
    transition: "background 0.2s ease",
  };
  const press = {
    onClick: onSelect,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelect();
      }
    },
    role: "button" as const,
    tabIndex: 0,
  };

  if (variant === "sleeve") {
    return (
      <div {...press} style={{ ...common, borderBottom: seam }}>
        <div
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: "1",
            overflow: "hidden",
          }}
        >
          <img
            src={track.artwork}
            alt={track.title}
            draggable={false}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
          {/* Sleeve pocket over the lower third with the mouth line + label */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: "34%",
              padding: "3.5cqmin 5cqmin",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: "1cqmin",
              background:
                "linear-gradient(to top, rgba(10,10,12,0.94) 55%, rgba(10,10,12,0.7) 100%)",
              borderTop: "1px solid rgba(255,255,255,0.28)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
            }}
          >
            <Title text={track.title} />
            <Artist text={track.artist} />
          </div>
        </div>
      </div>
    );
  }

  if (variant === "beside") {
    return (
      <div
        {...press}
        style={{
          ...common,
          display: "flex",
          alignItems: "stretch",
          gap: "4cqmin",
          padding: "3cqmin 4cqmin",
          borderBottom: seam,
        }}
      >
        <Pocket track={track} size="22cqmin" />
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: "1.2cqmin",
            borderLeft: "1px solid rgba(255,255,255,0.1)",
            paddingLeft: "4cqmin",
          }}
        >
          <Title text={track.title} />
          <Artist text={track.artist} />
        </div>
      </div>
    );
  }

  if (variant === "tab") {
    return (
      <div
        {...press}
        style={{
          ...common,
          display: "flex",
          alignItems: "center",
          gap: "3cqmin",
          padding: "2.5cqmin 0 2.5cqmin 4cqmin",
          borderBottom: seam,
        }}
      >
        <Pocket track={track} size="18cqmin" />
        <Title text={track.title} />
        {/* Index tab like a record divider */}
        <div
          style={{
            marginLeft: "auto",
            alignSelf: "stretch",
            display: "flex",
            alignItems: "center",
            padding: "0 4cqmin",
            background: active
              ? "var(--color-primary, #d4377b)"
              : "rgba(255,255,255,0.08)",
            color: active ? "#fff" : "rgba(255,255,255,0.7)",
            fontVariantNumeric: "tabular-nums",
            fontSize: "3.2cqmin",
            fontWeight: 700,
            letterSpacing: "0.1em",
            clipPath: "polygon(22% 0, 100% 0, 100% 100%, 22% 100%, 0 50%)",
          }}
        >
          {String(index + 1).padStart(2, "0")}
        </div>
      </div>
    );
  }

  if (variant === "crate") {
    return (
      <div
        {...press}
        style={{
          ...common,
          marginTop: index === 0 ? 0 : "-16cqmin",
          transform: active ? "translateY(-3cqmin)" : "none",
          transition: "transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94)",
        }}
      >
        <div
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: "1",
            borderRadius: "2cqmin 2cqmin 0 0",
            overflow: "hidden",
            boxShadow: "0 -6px 16px rgba(0,0,0,0.45)",
            borderTop: "1px solid rgba(255,255,255,0.35)",
          }}
        >
          <img
            src={track.artwork}
            alt={track.title}
            draggable={false}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
          {/* Name printed on the exposed top lip */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              height: "16cqmin",
              padding: "0 5cqmin",
              display: "flex",
              alignItems: "center",
              gap: "3cqmin",
              background:
                "linear-gradient(to bottom, rgba(10,10,12,0.9), rgba(10,10,12,0.0))",
            }}
          >
            <Title text={track.title} />
            <span
              style={{
                marginLeft: "auto",
                color: "rgba(255,255,255,0.55)",
                fontSize: "2.8cqmin",
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

  // editorial
  return (
    <div
      {...press}
      style={{
        ...common,
        display: "flex",
        alignItems: "center",
        gap: "5cqmin",
        padding: "4cqmin 5cqmin",
        borderBottom: index === count - 1 ? undefined : seam,
      }}
    >
      <Pocket track={track} size="26cqmin" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            color: "rgba(255,255,255,0.55)",
            fontSize: "2.6cqmin",
            fontWeight: 600,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          {track.artist} · {String(index + 1).padStart(2, "0")}
        </div>
        <div
          style={{
            color: "rgba(255,255,255,0.96)",
            fontSize: "7cqmin",
            fontWeight: 300,
            letterSpacing: "-0.02em",
            lineHeight: 1.05,
            textTransform: "lowercase",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {track.title}
        </div>
      </div>
    </div>
  );
}

/** A cover tucked into a pocket: rounded top, a mouth seam, tucked bottom. */
function Pocket({
  track,
  size,
}: {
  readonly track: QueueCoverflowTrack;
  readonly size: string;
}) {
  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "1.5cqmin",
        overflow: "hidden",
        boxShadow: "0 3px 10px rgba(0,0,0,0.4)",
      }}
    >
      <img
        src={track.artwork}
        alt={track.title}
        draggable={false}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
      {/* Pocket mouth: a bright seam with a soft inner shadow below it. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: "22%",
          height: "22%",
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.35) 100%)",
          borderBottom: "1px solid rgba(255,255,255,0.3)",
        }}
      />
    </div>
  );
}

function Title({ text }: { readonly text: string }) {
  return (
    <div
      style={{
        color: "rgba(255,255,255,0.98)",
        fontSize: "3.8cqmin",
        fontWeight: 600,
        letterSpacing: "0.005em",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {text}
    </div>
  );
}

function Artist({ text }: { readonly text: string }) {
  return (
    <div
      style={{
        color: "rgba(255,255,255,0.55)",
        fontSize: "2.9cqmin",
        fontWeight: 500,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {text}
    </div>
  );
}
