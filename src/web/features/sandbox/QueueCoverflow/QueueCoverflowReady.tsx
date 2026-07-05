/**
 * @module QueueCoverflowReady
 *
 * The interactive cover-flow + vinyl-detail surface for a populated queue.
 *
 * Intrinsic sizing: the surface fills its mounting host (the device frame) and
 * measures ITS OWN container — never the window — so every size is a fraction
 * of the device it is mounted in. There are no screen-size media queries; the
 * same code is correct on a Walkman, a phone, or a desktop. It composes the
 * extracted building blocks (backdrop, title, stage, detail) and owns only the
 * view/navigation state, not data fetching.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BlurredBackdrop } from "./components/BlurredBackdrop";
import { CoverflowDetail } from "./components/CoverflowDetail";
import { CoverflowStage } from "./components/CoverflowStage";
import { QueueTitleBar } from "./components/QueueTitleBar";
import type { QueueCoverflowTrack } from "./QueueCoverflowState";
import {
  computeCardSize,
  computeDetailSize,
  coverflowAxis,
} from "./queueCoverflowGeometry";

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

export function QueueCoverflowReady({
  tracks,
  initialIndex,
}: {
  readonly tracks: readonly QueueCoverflowTrack[];
  readonly initialIndex: number;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { width, height } = useContainerSize(rootRef);
  const measured = width > 0 && height > 0;
  // Reflow from the container's own aspect ratio: a wide frame fans the cards
  // horizontally; a tall frame flows them top-to-bottom. No screen media query.
  const axis = coverflowAxis(width, height);
  const cardSize = computeCardSize(width, height, axis);
  const detailSize = computeDetailSize(width, height);

  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [view, setView] = useState<"queue" | "detail">("queue");

  useEffect(() => {
    setActiveIndex((current) =>
      Math.min(current, Math.max(0, tracks.length - 1)),
    );
  }, [tracks.length]);

  const activeTrack = tracks[activeIndex] ?? tracks[0];
  const debouncedArtwork = useDebouncedValue(activeTrack?.artwork ?? "", 1000);

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
    if (index === activeIndex) setView("detail");
    else setActiveIndex(index);
  };

  return (
    <div
      ref={rootRef}
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

      {measured ? (
        <>
          <QueueTitleBar visible={view === "queue"} />

          {/* ── Queue View ────────────────────────────────────────── */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              cursor: "default",
              opacity: view === "queue" ? 1 : 0,
              pointerEvents: view === "queue" ? "auto" : "none",
              transition: "opacity 0.5s ease",
            }}
          >
            <CoverflowStage
              tracks={tracks}
              activeIndex={activeIndex}
              cardSize={cardSize}
              axis={axis}
              focusable={view === "queue"}
              onSelect={selectTrack}
            />
          </div>

          {/* ── Detail View ───────────────────────────────────────── */}
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
        </>
      ) : null}

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
