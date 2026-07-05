/**
 * @module QueueCoverflowReady
 *
 * The interactive cover-flow + vinyl-detail surface for a populated queue.
 * Presentational over a resolved snapshot: it owns view/navigation state but
 * not data fetching — the page selects the state and hands it real tracks.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Tonearm } from "./components/Tonearm";
import { VinylRecord } from "./components/VinylRecord";
import type { QueueCoverflowTrack } from "./QueueCoverflowState";
import {
  cardStyle,
  computeDetailSize,
  computeViewportCardSize,
  seededRotation,
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
  const containerRef = useRef<HTMLDivElement>(null);
  const cardSize = useViewportCardSize();
  const detailSize = useDetailSize();

  useEffect(() => {
    setActiveIndex((current) =>
      Math.min(current, Math.max(0, tracks.length - 1)),
    );
  }, [tracks.length]);

  const activeTrack = tracks[activeIndex] ?? tracks[0];
  const debouncedArtwork = useDebouncedValue(activeTrack?.artwork ?? "", 1000);

  const cardSpacing = cardSize * 0.95;
  const rotations = useMemo(
    () => tracks.map((_, i) => seededRotation(i)),
    [tracks],
  );

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

  const vinylSize = detailSize;

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
      {/* Blurred album artwork background */}
      <div
        style={{
          position: "absolute",
          inset: "-20%",
          backgroundImage: `url(${debouncedArtwork})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "blur(64px) saturate(1.6) brightness(0.45)",
          transform: "scale(1.3)",
          transition: "background-image 1.2s ease, filter 1.2s ease",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.25)",
        }}
      />

      {/* Title */}
      <div
        style={{
          position: "absolute",
          top: 24,
          left: 0,
          right: 0,
          textAlign: "center",
          zIndex: 200,
          opacity: view === "queue" ? 1 : 0,
          transition: "opacity 0.4s ease",
          pointerEvents: view === "queue" ? "auto" : "none",
        }}
      >
        <span
          style={{
            color: "rgba(255,255,255,0.85)",
            fontSize: 17,
            fontWeight: 600,
            letterSpacing: "0.02em",
          }}
        >
          Queue
        </span>
      </div>

      {/* ── Queue View ──────────────────────────────────────────── */}
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          inset: 0,
          cursor: "default",
          opacity: view === "queue" ? 1 : 0,
          pointerEvents: view === "queue" ? "auto" : "none",
          transition: "opacity 0.5s ease",
        }}
      >
        {tracks.map((track, index) => (
          // biome-ignore lint/a11y/useSemanticElements: cards are absolute-positioned rich media tiles; native button layout would distort the surface.
          <div
            key={track.id}
            role="button"
            tabIndex={view === "queue" ? 0 : -1}
            style={cardStyle({
              index,
              activeIndex,
              cardSize,
              cardSpacing,
              rotation: rotations[index] ?? 0,
            })}
            onClick={() => selectTrack(index)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                selectTrack(index);
              }
            }}
          >
            <img
              src={track.artwork}
              alt={track.title}
              draggable={false}
              style={{
                width: "100%",
                aspectRatio: "1",
                objectFit: "cover",
                borderRadius: 0,
                boxShadow:
                  index === activeIndex
                    ? [
                        "0 2px 4px rgba(0,0,0,0.15)",
                        "0 8px 16px rgba(0,0,0,0.14)",
                        "0 20px 40px rgba(0,0,0,0.18)",
                        "0 32px 64px rgba(0,0,0,0.10)",
                      ].join(", ")
                    : [
                        "0 1px 2px rgba(0,0,0,0.12)",
                        "0 4px 8px rgba(0,0,0,0.10)",
                        "0 12px 24px rgba(0,0,0,0.14)",
                        "0 24px 48px rgba(0,0,0,0.08)",
                      ].join(", "),
                transition: "box-shadow 0.4s ease",
                display: "block",
                position: "relative",
              }}
            />
            <div
              style={{
                marginTop: 12,
                textShadow:
                  "0 1px 3px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.15)",
                textAlign: "center",
                padding: "0 4px",
              }}
            >
              <div
                style={{
                  color:
                    index === activeIndex
                      ? "rgba(255,255,255,1)"
                      : "rgba(255,255,255,0.9)",
                  fontSize: Math.max(11, cardSize * 0.06),
                  fontWeight: 600,
                  lineHeight: 1.3,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  letterSpacing: "0.01em",
                }}
              >
                {track.title}
              </div>
              <div
                style={{
                  color:
                    index === activeIndex
                      ? "rgba(255,255,255,0.65)"
                      : "rgba(255,255,255,0.45)",
                  fontSize: Math.max(9, cardSize * 0.048),
                  fontWeight: 500,
                  marginTop: 2,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {track.artist}
              </div>
            </div>
          </div>
        ))}
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
        {/* Album + Vinyl + Info */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            transform: view === "detail" ? "scale(1)" : "scale(0.85)",
            transition: "transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
          }}
        >
          {/* Assembly */}
          <div
            style={{
              position: "relative",
              width: detailSize + vinylSize * 0.55,
              height: detailSize,
            }}
          >
            {/* Vinyl — behind album, slid right */}
            <div
              style={{
                position: "absolute",
                top: (detailSize - vinylSize) / 2,
                left: view === "detail" ? detailSize * 0.52 : detailSize * 0.2,
                transition: "left 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
                zIndex: 1,
              }}
            >
              <VinylRecord
                size={vinylSize}
                color={activeTrack?.dominantColor ?? "#666"}
                title={activeTrack?.title ?? ""}
                artist={activeTrack?.artist ?? ""}
                spinning={view === "detail"}
              />
              <Tonearm size={vinylSize} engaged={view === "detail"} />
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
                src={activeTrack?.artwork}
                alt={activeTrack?.title}
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
              textShadow:
                "0 1px 3px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.15)",
              opacity: view === "detail" ? 1 : 0,
              transform:
                view === "detail" ? "translateY(0)" : "translateY(12px)",
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
              {activeTrack?.title}
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
              {activeTrack?.artist}
            </div>
          </div>
        </div>
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
