/**
 * @module QueueCoverflowReady
 *
 * The interactive cover-flow + vinyl-detail surface for a populated queue.
 * Presentational over a resolved snapshot: it owns view/navigation state and
 * composes the extracted building blocks (backdrop, title, stage, detail) but
 * not data fetching — the page selects the state and hands it real tracks.
 */

import { useEffect, useState } from "react";
import { BlurredBackdrop } from "./components/BlurredBackdrop";
import { CoverflowDetail } from "./components/CoverflowDetail";
import { CoverflowStage } from "./components/CoverflowStage";
import { QueueTitleBar } from "./components/QueueTitleBar";
import type { QueueCoverflowTrack } from "./QueueCoverflowState";
import {
  computeDetailSize,
  computeViewportCardSize,
} from "./queueCoverflowGeometry";

function useViewportCardSize() {
  const [size, setSize] = useState(() =>
    computeViewportCardSize(window.innerWidth, window.innerHeight),
  );
  useEffect(() => {
    const onResize = () =>
      setSize(computeViewportCardSize(window.innerWidth, window.innerHeight));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

function useDetailSize() {
  const [size, setSize] = useState(() =>
    computeDetailSize(window.innerWidth, window.innerHeight),
  );
  useEffect(() => {
    const onResize = () =>
      setSize(computeDetailSize(window.innerWidth, window.innerHeight));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
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
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [view, setView] = useState<"queue" | "detail">("queue");
  const cardSize = useViewportCardSize();
  const detailSize = useDetailSize();

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
      if (e.key === "ArrowLeft") setActiveIndex((p) => Math.max(0, p - 1));
      else if (e.key === "ArrowRight")
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
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        fontFamily: "'Urbanist', 'SF Pro Display', system-ui, sans-serif",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      <BlurredBackdrop artwork={debouncedArtwork} />

      <QueueTitleBar visible={view === "queue"} />

      {/* ── Queue View ──────────────────────────────────────────── */}
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
          focusable={view === "queue"}
          onSelect={selectTrack}
        />
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
