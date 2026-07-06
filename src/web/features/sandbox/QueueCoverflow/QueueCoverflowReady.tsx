/**
 * @module QueueCoverflowReady
 *
 * The interactive cover-flow surface for a populated queue. The covers occupy
 * their own measured stack area and the title/artist lives in a separate
 * caption region, so artwork always stands alone. The caption placement is a
 * variation (`captionVariant`) so alternatives can be compared as templates.
 *
 * Intrinsic sizing: the stack area measures ITSELF (not the window), so cover
 * sizes and the reflow axis come from the container; no screen media queries.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BlurredBackdrop } from "./components/BlurredBackdrop";
import { CoverflowCaption } from "./components/CoverflowCaption";
import { CoverflowDetail } from "./components/CoverflowDetail";
import { CoverflowStage } from "./components/CoverflowStage";
import type { QueueCoverflowTrack } from "./QueueCoverflowState";
import {
  cardSpacingFor,
  computeCardSize,
  computeDetailSize,
  coverflowAxis,
  stepIndexFromDelta,
} from "./queueCoverflowGeometry";

export type CoverflowCaptionVariant = "below" | "above" | "editorial";

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

const captionSlotStyle: React.CSSProperties = {
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  padding: "clamp(0.6rem, 3cqmin, 1.4rem) clamp(1rem, 5cqmin, 2rem)",
};

export function QueueCoverflowReady({
  tracks,
  initialIndex,
  captionVariant = "editorial",
}: {
  readonly tracks: readonly QueueCoverflowTrack[];
  readonly initialIndex: number;
  readonly captionVariant?: CoverflowCaptionVariant;
}) {
  const stackRef = useRef<HTMLDivElement>(null);
  const { width, height } = useContainerSize(stackRef);
  const measured = width > 0 && height > 0;
  const axis = coverflowAxis(width, height);
  const cardSize = computeCardSize(width, height, axis);
  const detailSize = computeDetailSize(width, height);
  const cardSpacing = cardSpacingFor(cardSize, axis);

  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [view, setView] = useState<"queue" | "detail">("queue");

  useEffect(() => {
    setActiveIndex((current) =>
      Math.min(current, Math.max(0, tracks.length - 1)),
    );
  }, [tracks.length]);

  // ── Touch / pointer drag + wheel scrubbing ──────────────────────────────
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ pos: number; index: number } | null>(null);
  const dragOffsetRef = useRef(0);
  const draggedRef = useRef(false);
  const wheelAccRef = useRef(0);
  const lastCount = tracks.length;

  const pointerPos = (e: React.PointerEvent<HTMLElement>) =>
    axis === "x" ? e.clientX : e.clientY;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (view !== "queue") return;
    dragStartRef.current = { pos: pointerPos(e), index: activeIndex };
    draggedRef.current = false;
    dragOffsetRef.current = 0;
    setDragOffset(0);
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    if (!start) return;
    const raw = pointerPos(e) - start.pos;
    if (Math.abs(raw) > 6) draggedRef.current = true;
    const maxOff = (start.index + 0.5) * cardSpacing;
    const minOff = (start.index - (lastCount - 1) - 0.5) * cardSpacing;
    const clamped = Math.max(minOff, Math.min(raw, maxOff));
    dragOffsetRef.current = clamped;
    setDragOffset(clamped);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    if (start) {
      setActiveIndex(
        stepIndexFromDelta(
          start.index,
          dragOffsetRef.current,
          cardSpacing,
          lastCount,
        ),
      );
    }
    dragStartRef.current = null;
    dragOffsetRef.current = 0;
    setDragOffset(0);
    setDragging(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (view !== "queue") return;
    const step = Math.max(24, cardSpacing * 0.5);
    const primary = axis === "x" ? e.deltaX || e.deltaY : e.deltaY;
    wheelAccRef.current += primary;
    while (Math.abs(wheelAccRef.current) >= step) {
      const dir = Math.sign(wheelAccRef.current);
      setActiveIndex((p) => Math.min(Math.max(0, p + dir), lastCount - 1));
      wheelAccRef.current -= dir * step;
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && view === "detail") {
        setView("queue");
        return;
      }
      if (view !== "queue") return;
      if (e.key === "ArrowLeft" || e.key === "ArrowUp")
        setActiveIndex((p) => Math.max(0, p - 1));
      else if (e.key === "ArrowRight" || e.key === "ArrowDown")
        setActiveIndex((p) => Math.min(Math.max(0, tracks.length - 1), p + 1));
      else if (e.key === "Enter") setView("detail");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tracks.length, view]);

  const selectTrack = (index: number) => {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    if (index === activeIndex) setView("detail");
    else setActiveIndex(index);
  };

  // Fractional active position while dragging → live reselection.
  const scrollIndex =
    dragging && cardSpacing > 0
      ? activeIndex - dragOffset / cardSpacing
      : activeIndex;
  const nearestIndex = Math.min(
    Math.max(0, Math.round(scrollIndex)),
    Math.max(0, tracks.length - 1),
  );
  const captionTrack = tracks[nearestIndex];
  const activeTrack = tracks[activeIndex] ?? tracks[0];
  const debouncedArtwork = useDebouncedValue(
    captionTrack?.artwork ?? activeTrack?.artwork ?? "",
    600,
  );

  const showCaptionAbove = captionVariant === "above";
  const showCaptionBelow =
    captionVariant === "below" || captionVariant === "editorial";

  // The stack clips to its own area so covers can never spill onto the caption,
  // with a soft edge fade so the outermost covers dissolve instead of hard-cut.
  const stackFadeMask =
    axis === "y"
      ? "linear-gradient(to bottom, transparent 0%, #000 9%, #000 91%, transparent 100%)"
      : "linear-gradient(to right, transparent 0%, #000 9%, #000 91%, transparent 100%)";

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
          opacity: view === "queue" ? 1 : 0,
          pointerEvents: view === "queue" ? "auto" : "none",
          transition: "opacity 0.5s ease",
        }}
      >
        {showCaptionAbove ? (
          <div style={captionSlotStyle}>
            <CoverflowCaption
              track={captionTrack}
              index={nearestIndex}
              count={tracks.length}
            />
          </div>
        ) : null}

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
            maskImage: stackFadeMask,
            WebkitMaskImage: stackFadeMask,
            touchAction: "none",
            cursor: view === "queue" ? "grab" : "default",
          }}
        >
          {measured ? (
            <CoverflowStage
              tracks={tracks}
              activeIndex={scrollIndex}
              cardSize={cardSize}
              axis={axis}
              dragging={dragging}
              focusable={view === "queue"}
              onSelect={selectTrack}
            />
          ) : null}
        </div>

        {showCaptionBelow ? (
          <div style={captionSlotStyle}>
            <CoverflowCaption
              track={captionTrack}
              index={nearestIndex}
              count={tracks.length}
              editorial={captionVariant === "editorial"}
            />
          </div>
        ) : null}
      </div>

      {/* ── Detail View ─────────────────────────────────────────── */}
      {/* biome-ignore lint/a11y/useSemanticElements: full-screen rich detail surface acts like a dismissable overlay, not a native button. */}
      <div
        role="button"
        tabIndex={view === "detail" ? 0 : -1}
        onClick={() => setView("queue")}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setView("queue");
          }
        }}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "default",
          opacity: view === "detail" ? 1 : 0,
          pointerEvents: view === "detail" ? "auto" : "none",
          transition: "opacity 0.5s ease",
        }}
      >
        <CoverflowDetail
          track={activeTrack}
          detailSize={detailSize}
          open={view === "detail"}
        />
      </div>

      {/* Vinyl spin keyframes */}
      <style>{`
        @keyframes vinyl-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
