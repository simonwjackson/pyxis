/**
 * @module QueueList
 *
 * Modern, flat, art-forward queue list matching the coverflow's language:
 * neutral dark ground, generous whitespace, editorial type (uppercase kicker +
 * big lowercase title), hairline separators. No skeuomorphism, no theme tokens.
 * Container-query sized for intrinsic scaling.
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
  fontFamily: "'Urbanist', system-ui, sans-serif",
};

const scrollStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 1,
  overflowY: "auto",
  WebkitOverflowScrolling: "touch",
};

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

const HAIR = "rgba(255,255,255,0.09)";
const coverShadow = "0 1px 2px rgba(0,0,0,0.3), 0 8px 20px rgba(0,0,0,0.35)";

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
      <div style={scrollStyle}>
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
        fontSize: "2.7cqmin",
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
  radius = "1.4cqmin",
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
          gap: "5cqmin",
          padding: "4.5cqmin 6cqmin",
          borderBottom: last ? undefined : `1px solid ${HAIR}`,
          background: activeBg,
          cursor: "pointer",
          transition: "background 0.2s ease",
        }}
      >
        <Cover track={track} size="30cqmin" />
        <div
          style={{
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: "1.4cqmin",
          }}
        >
          <Kicker track={track} index={index} count={count} />
          <Title text={track.title} size="7cqmin" active={active} />
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
            gap: "6cqmin",
            padding: "6cqmin 7cqmin",
            borderBottom: last ? undefined : `1px solid ${HAIR}`,
            background: activeBg,
            cursor: "pointer",
          }}
        >
          <div
            style={{
              height: "min(72cqh, 46cqw)",
              aspectRatio: "1",
              flexShrink: 0,
              borderRadius: "2cqmin",
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
          <div
            style={{
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              gap: "2cqmin",
            }}
          >
            <Kicker track={track} index={index} count={count} />
            <Title text={track.title} size="7cqmin" active={active} />
          </div>
        </div>
      );
    }
    return (
      <div
        {...pressProps(onSelect)}
        style={{
          padding: "6cqmin 6cqmin 5cqmin",
          borderBottom: last ? undefined : `1px solid ${HAIR}`,
          background: activeBg,
          cursor: "pointer",
        }}
      >
        <div style={{ width: "100%" }}>
          <Cover track={track} size="100%" radius="2cqmin" />
        </div>
        <div
          style={{
            marginTop: "3.5cqmin",
            display: "flex",
            flexDirection: "column",
            gap: "1.6cqmin",
          }}
        >
          <Kicker track={track} index={index} count={count} />
          <Title text={track.title} size="8.5cqmin" active={active} />
        </div>
      </div>
    );
  }

  // compact
  if (variant === "compact") {
    return (
      <div
        {...pressProps(onSelect)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "3.5cqmin",
          padding: "2.8cqmin 6cqmin",
          borderBottom: last ? undefined : `1px solid ${HAIR}`,
          background: activeBg,
          cursor: "pointer",
        }}
      >
        <Cover track={track} size="13cqmin" radius="1cqmin" />
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: "0.8cqmin",
          }}
        >
          <div
            style={{
              color: active ? "#fff" : "rgba(255,255,255,0.9)",
              fontSize: "4cqmin",
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
              fontSize: "3cqmin",
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
            fontSize: "3cqmin",
            fontWeight: 600,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {String(index + 1).padStart(2, "0")}
        </div>
      </div>
    );
  }

  return null;
}
