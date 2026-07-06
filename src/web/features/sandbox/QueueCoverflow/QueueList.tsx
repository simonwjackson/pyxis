/**
 * @module QueueList
 *
 * Modern, art-forward queue list. Every size derives from the intrinsic-design
 * generator (see caliper/intrinsic.css): text from the modular scale
 * (--pyxis-text-*), spacing from the em space steps (--pyxis-space-*), covers
 * bounded against the base (--pyxis-base). The five systemic knobs
 * (BASE/MIN/CEIL/RATIO/SPACE) drive the whole design — no per-component values.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BlurredBackdrop } from "./components/BlurredBackdrop";
import type { QueueCoverflowTrack } from "./QueueCoverflowState";

export type QueueListVariant = "editorial" | "bleed" | "compact";

const rootStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  overflow: "hidden",
  containerType: "size",
  background: "#0b0b0e",
};

const scrollStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 1,
  overflowY: "auto",
  WebkitOverflowScrolling: "touch",
  fontFamily: "'Urbanist', system-ui, sans-serif",
  // Anchor the whole surface to the generator's body step so every em (space,
  // icon sizes) tracks the one container-derived scale.
  fontSize: "var(--pyxis-text-body)",
};

const HAIR = "rgba(255,255,255,0.09)";
const coverShadow = "0 1px 2px rgba(0,0,0,0.3), 0 8px 20px rgba(0,0,0,0.35)";

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

/** Watch the surface's own box so layout reflows from the container, not the
 * screen. Landscape when the container is wider than it is tall. */
function useLandscape(ref: React.RefObject<HTMLElement | null>): boolean {
  const [landscape, setLandscape] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setLandscape(el.clientWidth > el.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return landscape;
}

export function QueueList({
  tracks,
  variant,
}: {
  readonly tracks: readonly QueueCoverflowTrack[];
  readonly variant: QueueListVariant;
}) {
  const [selected, setSelected] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const landscape = useLandscape(rootRef);
  const activeArtwork = useDebouncedValue(tracks[selected]?.artwork ?? "", 450);
  return (
    <div ref={rootRef} style={rootStyle}>
      <BlurredBackdrop artwork={activeArtwork} />
      <div className="pyxis-intrinsic" style={scrollStyle}>
        {tracks.map((track, index) => (
          <Row
            key={track.id}
            track={track}
            index={index}
            count={tracks.length}
            variant={variant}
            landscape={landscape}
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

function Kicker({
  track,
  index,
  count,
}: {
  readonly track: QueueCoverflowTrack;
  readonly index: number;
  readonly count: number;
}) {
  return (
    <div
      style={{
        color: "rgba(255,255,255,0.5)",
        fontSize: "var(--pyxis-text-fine)",
        fontWeight: 600,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {track.artist} · {index + 1} / {count}
    </div>
  );
}

function Title({
  text,
  size,
  active,
}: {
  readonly text: string;
  readonly size: string;
  readonly active: boolean;
}) {
  return (
    <div
      style={{
        color: active ? "rgba(255,255,255,0.98)" : "rgba(255,255,255,0.82)",
        fontSize: size,
        fontWeight: 300,
        letterSpacing: "-0.02em",
        lineHeight: 1.04,
        textTransform: "lowercase",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {text}
    </div>
  );
}

function Cover({
  track,
  size,
  radius = "var(--pyxis-space-1)",
}: {
  readonly track: QueueCoverflowTrack;
  readonly size: string;
  readonly radius?: string;
}) {
  return (
    <div
      style={{
        width: size,
        aspectRatio: "1",
        flexShrink: 0,
        borderRadius: radius,
        overflow: "hidden",
        boxShadow: coverShadow,
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
    </div>
  );
}

function Row({
  track,
  index,
  count,
  variant,
  landscape,
  active,
  onSelect,
}: {
  readonly track: QueueCoverflowTrack;
  readonly index: number;
  readonly count: number;
  readonly variant: QueueListVariant;
  readonly landscape: boolean;
  readonly active: boolean;
  readonly onSelect: () => void;
}) {
  const activeBg = active ? "rgba(255,255,255,0.04)" : "transparent";
  const last = index === count - 1;

  if (variant === "editorial") {
    return (
      <div
        {...pressProps(onSelect)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--pyxis-space-4)",
          padding: "var(--pyxis-space-4) var(--pyxis-space-5)",
          borderBottom: last ? undefined : `1px solid ${HAIR}`,
          background: activeBg,
          cursor: "pointer",
          transition: "background 0.2s ease",
        }}
      >
        <Cover track={track} size="calc(var(--pyxis-base) * 4.5)" />
        <div
          style={{
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: "var(--pyxis-space-1)",
          }}
        >
          <Kicker track={track} index={index} count={count} />
          <Title
            text={track.title}
            size="var(--pyxis-text-heading)"
            active={active}
          />
        </div>
      </div>
    );
  }

  if (variant === "bleed") {
    // Landscape: a full-width square cover is taller than the frame, so lay the
    // cover beside the caption and cap it to the container height instead.
    if (landscape) {
      return (
        <div
          {...pressProps(onSelect)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--pyxis-space-6)",
            padding: "var(--pyxis-space-5) var(--pyxis-space-6)",
            borderBottom: last ? undefined : `1px solid ${HAIR}`,
            background: activeBg,
            cursor: "pointer",
          }}
        >
          <Cover
            track={track}
            size="min(72cqh, calc(var(--pyxis-base) * 12))"
            radius="var(--pyxis-space-2)"
          />
          <div
            style={{
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              gap: "var(--pyxis-space-2)",
            }}
          >
            <Kicker track={track} index={index} count={count} />
            <Title
              text={track.title}
              size="var(--pyxis-text-heading)"
              active={active}
            />
          </div>
        </div>
      );
    }
    return (
      <div
        {...pressProps(onSelect)}
        style={{
          padding:
            "var(--pyxis-space-5) var(--pyxis-space-5) var(--pyxis-space-4)",
          borderBottom: last ? undefined : `1px solid ${HAIR}`,
          background: activeBg,
          cursor: "pointer",
        }}
      >
        <div style={{ width: "100%" }}>
          <Cover track={track} size="100%" radius="var(--pyxis-space-2)" />
        </div>
        <div
          style={{
            marginTop: "var(--pyxis-space-3)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--pyxis-space-2)",
          }}
        >
          <Kicker track={track} index={index} count={count} />
          <Title
            text={track.title}
            size="var(--pyxis-text-display)"
            active={active}
          />
        </div>
      </div>
    );
  }

  // compact
  return (
    <div
      {...pressProps(onSelect)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--pyxis-space-3)",
        padding: "var(--pyxis-space-3) var(--pyxis-space-5)",
        borderBottom: last ? undefined : `1px solid ${HAIR}`,
        background: activeBg,
        cursor: "pointer",
      }}
    >
      <Cover track={track} size="calc(var(--pyxis-base) * 2.4)" />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: "var(--pyxis-space-1)",
        }}
      >
        <div
          style={{
            color: active ? "#fff" : "rgba(255,255,255,0.9)",
            fontSize: "var(--pyxis-text-title)",
            fontWeight: 500,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {track.title}
        </div>
        <div
          style={{
            color: "rgba(255,255,255,0.45)",
            fontSize: "var(--pyxis-text-fine)",
            fontWeight: 500,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {track.artist}
        </div>
      </div>
      <div
        style={{
          color: "rgba(255,255,255,0.35)",
          fontSize: "var(--pyxis-text-fine)",
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {String(index + 1).padStart(2, "0")}
      </div>
    </div>
  );
}
