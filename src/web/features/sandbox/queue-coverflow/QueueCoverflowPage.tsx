import { useState, useRef, useEffect, useCallback, useMemo } from "react";

type Track = {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  dominantColor: string;
};

const MOCK_TRACKS: Track[] = [
  {
    id: "1",
    title: "Seaside Drive",
    artist: "Luna Mars",
    artwork:
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&h=600&fit=crop",
    dominantColor: "#4a8a9a",
  },
  {
    id: "2",
    title: "Crimson Room",
    artist: "Nyx Collective",
    artwork:
      "https://images.unsplash.com/photo-1549490349-8643362247b5?w=600&h=600&fit=crop",
    dominantColor: "#a83a3a",
  },
  {
    id: "3",
    title: "GAZE Pt. 2",
    artist: "Marian Voss",
    artwork:
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&h=600&fit=crop",
    dominantColor: "#3a7aaa",
  },
  {
    id: "4",
    title: "BUBBLE REACH",
    artist: "Twilight Mirage",
    artwork:
      "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&h=600&fit=crop",
    dominantColor: "#7a4a8a",
  },
  {
    id: "5",
    title: "Blush Hour",
    artist: "Winter Bloom",
    artwork:
      "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&h=600&fit=crop",
    dominantColor: "#d4956a",
  },
  {
    id: "6",
    title: "Neon Drift",
    artist: "Echo Valley",
    artwork:
      "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&h=600&fit=crop",
    dominantColor: "#2a4a7a",
  },
  {
    id: "7",
    title: "Amber Waves",
    artist: "Sol Meridian",
    artwork:
      "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&h=600&fit=crop",
    dominantColor: "#9a7a2a",
  },
];

/**
 * Seeded random per-card rotation so they look casually scattered but stay
 * stable across renders.  Center card always gets 0.
 */
function seededRotation(index: number): number {
  const seed = Math.sin(index * 137.508 + 42) * 10000;
  return ((seed - Math.floor(seed)) - 0.5) * 14; // ±7°
}

function useViewportCardSize() {
  const [size, setSize] = useState(() => computeSize());

  function computeSize() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Card should be ~28% of the shorter dimension, clamped
    const base = Math.min(vw, vh) * 0.32;
    return Math.max(120, Math.min(base, 360));
  }

  useEffect(() => {
    const onResize = () => setSize(computeSize());
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

export function QueueCoverflowPage() {
  const [activeIndex, setActiveIndex] = useState(2);
  const containerRef = useRef<HTMLDivElement>(null);
  const cardSize = useViewportCardSize();

  const activeTrack = MOCK_TRACKS[activeIndex];
  const debouncedArtwork = useDebouncedValue(activeTrack?.artwork ?? "", 1000);

  // Overlap: cards overlap by ~40% of their width
  const cardSpacing = cardSize * 0.95;

  const rotations = useMemo(
    () => MOCK_TRACKS.map((_, i) => seededRotation(i)),
    [],
  );




  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && activeIndex > 0)
        setActiveIndex((p) => p - 1);
      else if (e.key === "ArrowRight" && activeIndex < MOCK_TRACKS.length - 1)
        setActiveIndex((p) => p + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIndex]);

  const getCardStyle = (index: number): React.CSSProperties => {
    const diff = index - activeIndex;
    const continuous = diff;
    const absCont = Math.abs(continuous);

    // Horizontal position relative to center
    const translateX = continuous * cardSpacing;

    // Rotation: center card is straight, others get their seeded rotation
    // Blend toward 0 as the card approaches center
    const baseRot = rotations[index] ?? 0;
    const rotate = baseRot;

    // Scale: center card is biggest, others shrink
    const scale = 1;

    // Z-index: center on top, further cards underneath
    const zIndex = 100 - Math.round(absCont * 10);

    // Opacity
    const opacity = 1;

    return {
      position: "absolute" as const,
      left: "50%",
      top: "50%",
      width: cardSize,
      marginLeft: -cardSize / 2,
      marginTop: -cardSize / 2 - 16, // nudge up slightly so labels don't clip bottom
      transform: `translateX(${translateX}px) rotate(${rotate}deg) scale(${scale})`,
      zIndex,
      opacity,
      transition: "transform 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.45s ease",
    };
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
      {/* Dark scrim for contrast */}
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

      {/* Carousel area */}
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          inset: 0,
          cursor: "default",
          touchAction: "pan-y",
        }}
      >
        {MOCK_TRACKS.map((track, index) => (
          <div
            key={track.id}
            style={getCardStyle(index)}
            onClick={() => {
              if (index !== activeIndex) {
                setActiveIndex(index);
              }
            }}
          >
            {/* Album art */}
            <img
              src={track.artwork}
              alt={track.title}
              draggable={false}
              style={{
                width: "100%",
                aspectRatio: "1",
                objectFit: "cover",
                borderRadius: 0,
                boxShadow: [
                  "0 1px 2px rgba(0,0,0,0.12)",      // contact edge
                  "0 4px 8px rgba(0,0,0,0.10)",      // near hover
                  "0 12px 24px rgba(0,0,0,0.14)",    // main lift
                  "0 24px 48px rgba(0,0,0,0.08)",    // ambient spread
                ].join(", "),
                display: "block",
                position: "relative",
              }}
            />

            {/* Track info below */}
            <div
              style={{
                marginTop: 12,
                textShadow: "0 1px 3px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.15)",
                textAlign: "center",
                padding: "0 4px",
              }}
            >
              <div
                style={{
                  color: "rgba(255,255,255,0.9)",
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
                  color: "rgba(255,255,255,0.45)",
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
    </div>
  );
}
