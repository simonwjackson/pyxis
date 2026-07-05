/**
 * @module QueueCoverflowDeck
 *
 * The "pulled card" queue surface: the selected album is centred with empty
 * padding above and below, and the rest fan into staggered lip-stacks. Tuning
 * (gap, lip, stack shrink, rotation) is exposed so variations can be compared
 * as templates. Sizing is intrinsic — measured from its own stack container.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BlurredBackdrop } from "./components/BlurredBackdrop";
import { CoverflowCaption } from "./components/CoverflowCaption";
import { CoverflowCard } from "./components/CoverflowCard";
import { deckLayout } from "./deckLayout";
import type { QueueCoverflowTrack } from "./QueueCoverflowState";
import { stepIndexFromDelta } from "./queueCoverflowGeometry";

export interface DeckTuning {
  /** Empty gap around the selected card, as a fraction of the card. */
  readonly gap: number;
  /** Exposed lip per stacked card, as a fraction of the card. */
  readonly lip: number;
  /** Per-card shrink for the stack (1 = same size). */
  readonly stackScale: number;
  /** Per-card fan rotation, in degrees. */
  readonly rotationStep: number;
  readonly maxPerSide: number;
}

interface Size {
  readonly width: number;
  readonly height: number;
}

function useContainerSize(ref: React.RefObject<HTMLElement | null>): Size {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () =>
      setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function QueueCoverflowDeck({
  tracks,
  initialIndex,
  tuning,
}: {
  readonly tracks: readonly QueueCoverflowTrack[];
  readonly initialIndex: number;
  readonly tuning: DeckTuning;
}) {
  const stackRef = useRef<HTMLDivElement>(null);
  const { width, height } = useContainerSize(stackRef);
  const measured = width > 0 && height > 0;
  const cardSize = Math.max(72, Math.min(width * 0.6, height * 0.42, 360));

  const [activeIndex, setActiveIndex] = useState(initialIndex);
  useEffect(() => {
    setActiveIndex((c) => Math.min(c, Math.max(0, tracks.length - 1)));
  }, [tracks.length]);

  const dragStartRef = useRef<{ pos: number; index: number } | null>(null);
  const draggedRef = useRef(false);
  const wheelAccRef = useRef(0);
  const dragStep = Math.max(24, cardSize * (tuning.gap + tuning.lip + 0.12));

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragStartRef.current = { pos: e.clientY, index: activeIndex };
    draggedRef.current = false;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    if (!start) return;
    const delta = e.clientY - start.pos;
    if (Math.abs(delta) > 6) draggedRef.current = true;
    setActiveIndex(
      stepIndexFromDelta(start.index, delta, dragStep, tracks.length),
    );
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragStartRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    wheelAccRef.current += e.deltaY;
    const step = Math.max(24, dragStep * 0.6);
    while (Math.abs(wheelAccRef.current) >= step) {
      const dir = Math.sign(wheelAccRef.current);
      setActiveIndex((p) => Math.min(Math.max(0, p + dir), tracks.length - 1));
      wheelAccRef.current -= dir * step;
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowUp")
        setActiveIndex((p) => Math.max(0, p - 1));
      else if (e.key === "ArrowRight" || e.key === "ArrowDown")
        setActiveIndex((p) => Math.min(Math.max(0, tracks.length - 1), p + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tracks.length]);

  const select = (index: number) => {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    setActiveIndex(index);
  };

  const activeTrack = tracks[activeIndex] ?? tracks[0];
  const debouncedArtwork = useDebouncedValue(activeTrack?.artwork ?? "", 500);

  const items = measured
    ? deckLayout({
        activeIndex,
        count: tracks.length,
        cardSize,
        gap: cardSize * tuning.gap,
        lip: cardSize * tuning.lip,
        stackScale: tuning.stackScale,
        rotationStep: tuning.rotationStep,
        maxPerSide: tuning.maxPerSide,
      })
    : [];

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        containerType: "size",
        fontFamily: "'Urbanist', 'SF Pro Display', system-ui, sans-serif",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      <BlurredBackdrop artwork={debouncedArtwork} />

      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          ref={stackRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
          style={{
            position: "relative",
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            touchAction: "none",
            cursor: "grab",
          }}
        >
          {items.map((item) => {
            const track = tracks[item.index];
            if (!track) return null;
            return (
              // biome-ignore lint/a11y/useSemanticElements: absolute-positioned media tile.
              <div
                key={track.id}
                role="button"
                tabIndex={0}
                onClick={() => select(item.index)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    select(item.index);
                  }
                }}
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: cardSize,
                  marginLeft: -cardSize / 2,
                  marginTop: -cardSize / 2,
                  transform: `translateY(${item.y}px) scale(${item.scale}) rotate(${item.rotation}deg)`,
                  zIndex: item.zIndex,
                  transition:
                    "transform 0.42s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
                }}
              >
                <CoverflowCard
                  track={track}
                  active={item.index === activeIndex}
                />
              </div>
            );
          })}
        </div>

        <div
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            padding: "clamp(0.6rem, 3cqmin, 1.4rem) clamp(1rem, 5cqmin, 2rem)",
          }}
        >
          <CoverflowCaption
            track={activeTrack}
            index={activeIndex}
            count={tracks.length}
          />
        </div>
      </div>
    </div>
  );
}
