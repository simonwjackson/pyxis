import { useState, useRef, useEffect, useMemo } from "react";
import { trpc } from "@/web/shared/lib/trpc";

type Track = {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  dominantColor: string;
};

type LibraryAlbum = {
  id: string;
  title: string;
  artist: string;
  artworkUrl?: string | null;
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

function seededRotation(index: number): number {
  const seed = Math.sin(index * 137.508 + 42) * 10000;
  return ((seed - Math.floor(seed)) - 0.5) * 14;
}


function colorFromId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 45% 48%)`;
}

function toSandboxTrack(album: LibraryAlbum): Track | null {
  if (!album.artworkUrl) return null;
  return {
    id: album.id,
    title: album.title,
    artist: album.artist,
    artwork: album.artworkUrl,
    dominantColor: colorFromId(album.id),
  };
}

function useViewportCardSize() {
  const [size, setSize] = useState(() => computeSize());
  function computeSize() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
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

function useDetailSize() {
  const [size, setSize] = useState(() => computeSize());
  function computeSize() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return Math.min(vw * 0.55, vh * 0.75);
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

/* ── Vinyl Record ──────────────────────────────────────────────── */

function VinylRecord({
  size,
  color,
  title,
  artist,
  spinning,
}: {
  size: number;
  color: string;
  title: string;
  artist: string;
  spinning: boolean;
}) {
  const labelRadius = size * 0.18;
  const textPathRadius = labelRadius * 0.68;
  const grooveCount = 28;

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        position: "relative",
        animation: spinning ? "vinyl-spin 3s linear infinite" : undefined,
        background: `
          radial-gradient(circle at 50% 50%, transparent ${labelRadius - 2}px, ${color}22 ${labelRadius}px, transparent ${labelRadius + 1}px),
          radial-gradient(circle at 35% 35%, ${color}33 0%, transparent 50%),
          radial-gradient(circle at 65% 60%, ${color}22 0%, transparent 40%),
          radial-gradient(circle, #1a1a1a 0%, #111 40%, #1a1a1a 60%, #0d0d0d 100%)
        `,
        boxShadow: [
          "inset 0 0 0 1px rgba(255,255,255,0.04)",
          "0 2px 8px rgba(0,0,0,0.3)",
          "0 12px 32px rgba(0,0,0,0.25)",
        ].join(", "),
      }}
    >
      {/* Groove lines */}
      <svg
        width={size}
        height={size}
        style={{ position: "absolute", inset: 0 }}
      >
        {Array.from({ length: grooveCount }, (_, i) => {
          const r = labelRadius + 4 + ((size / 2 - labelRadius - 8) / grooveCount) * (i + 0.5);
          return (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="rgba(255,255,255,0.03)"
              strokeWidth={0.5}
            />
          );
        })}
      </svg>

      {/* Highlight sheen */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 40%, transparent 60%, rgba(255,255,255,0.03) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* Center label */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: labelRadius * 2,
          height: labelRadius * 2,
          marginLeft: -labelRadius,
          marginTop: -labelRadius,
          borderRadius: "50%",
          background: `
            radial-gradient(circle, ${color}44 0%, ${color}88 60%, ${color}66 100%)
          `,
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08), 0 0 8px rgba(0,0,0,0.4)",
        }}
      >
        {/* Spindle hole */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 6,
            height: 6,
            marginLeft: -3,
            marginTop: -3,
            borderRadius: "50%",
            background: "#111",
            boxShadow: "inset 0 1px 2px rgba(0,0,0,0.6)",
          }}
        />
        {/* Circular text */}
        <svg
          width={labelRadius * 2}
          height={labelRadius * 2}
          style={{ position: "absolute", inset: 0 }}
        >
          <defs>
            <path
              id="label-curve"
              d={`M ${labelRadius},${labelRadius - textPathRadius} A ${textPathRadius},${textPathRadius} 0 1,1 ${labelRadius - 0.01},${labelRadius - textPathRadius}`}
            />
          </defs>
          <text
            fill="rgba(255,255,255,0.7)"
            fontSize={Math.max(7, labelRadius * 0.16)}
            fontFamily="'Urbanist', system-ui, sans-serif"
            fontWeight={600}
            letterSpacing="0.12em"
          >
            <textPath href="#label-curve" startOffset="0%">
              {title.toUpperCase()}  ·  {artist.toUpperCase()}  ·  {title.toUpperCase()}  ·  {artist.toUpperCase()}
            </textPath>
          </text>
        </svg>
      </div>
    </div>
  );
}

/* ── Tonearm ───────────────────────────────────────────────────── */

function Tonearm({ size, engaged }: { size: number; engaged: boolean }) {
  const armLength = size * 0.48;
  const headWidth = size * 0.04;

  return (
    <div
      style={{
        position: "absolute",
        top: size * 0.08,
        right: size * 0.08,
        width: armLength,
        height: armLength,
        transformOrigin: "85% 8%",
        transform: `rotate(${engaged ? 22 : 0}deg)`,
        transition: "transform 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        zIndex: 10,
      }}
    >
      {/* Pivot base */}
      <div
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          width: size * 0.07,
          height: size * 0.07,
          borderRadius: "50%",
          background: "radial-gradient(circle, #444 0%, #222 100%)",
          boxShadow: "0 2px 6px rgba(0,0,0,0.5)",
        }}
      />
      {/* Arm shaft */}
      <div
        style={{
          position: "absolute",
          right: size * 0.035 - 1.5,
          top: size * 0.035,
          width: 3,
          height: armLength * 0.85,
          background: "linear-gradient(90deg, #666, #aaa, #666)",
          borderRadius: 1.5,
          transformOrigin: "top center",
          transform: "rotate(0deg)",
          boxShadow: "1px 2px 4px rgba(0,0,0,0.3)",
        }}
      />
      {/* Cartridge/head */}
      <div
        style={{
          position: "absolute",
          right: size * 0.035 - headWidth / 2,
          top: size * 0.035 + armLength * 0.83,
          width: headWidth,
          height: headWidth * 1.8,
          background: "linear-gradient(180deg, #333, #111)",
          borderRadius: 1,
          boxShadow: "0 2px 4px rgba(0,0,0,0.4)",
        }}
      />
    </div>
  );
}

/* ── Main Page ─────────────────────────────────────────────────── */

export function QueueCoverflowPage() {
  const albumsQuery = trpc.library.albums.useQuery({
    includeArchive: true,
    includeDismissed: true,
  });
  const [activeIndex, setActiveIndex] = useState(2);
  const [view, setView] = useState<"queue" | "detail">("queue");
  const containerRef = useRef<HTMLDivElement>(null);
  const cardSize = useViewportCardSize();
  const detailSize = useDetailSize();

  const tracks = useMemo(() => {
    const realTracks = (albumsQuery.data ?? [])
      .map((album) => toSandboxTrack(album))
      .filter((track): track is Track => track !== null);
    return realTracks.length > 0 ? realTracks : MOCK_TRACKS;
  }, [albumsQuery.data]);

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(0, tracks.length - 1)));
  }, [tracks.length]);

  const activeTrack = tracks[activeIndex] ?? tracks[0] ?? MOCK_TRACKS[0];
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
      if (e.key === "ArrowLeft" && activeIndex > 0)
        setActiveIndex((p) => p - 1);
      else if (e.key === "ArrowRight" && activeIndex < tracks.length - 1)
        setActiveIndex((p) => p + 1);
      else if (e.key === "Enter")
        setView("detail");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIndex, view]);

  const getCardStyle = (index: number): React.CSSProperties => {
    const diff = index - activeIndex;
    const absCont = Math.abs(diff);
    const isActive = index === activeIndex;
    const translateX = diff * cardSpacing;
    const baseRot = rotations[index] ?? 0;
    const zIndex = isActive ? 120 : 100 - Math.round(absCont * 10);

    // Active card: straighten, scale up, lift
    const rotate = isActive ? 0 : baseRot;
    const scale = isActive ? 1.08 : 1;
    const translateY = isActive ? -8 : 0;
    const opacity = isActive ? 1 : 0.55;

    return {
      position: "absolute" as const,
      left: "50%",
      top: "50%",
      width: cardSize,
      marginLeft: -cardSize / 2,
      marginTop: -cardSize / 2 - 16,
      transform: `translateX(${translateX}px) translateY(${translateY}px) rotate(${rotate}deg) scale(${scale})`,
      zIndex,
      opacity,
      transition:
        "transform 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.4s ease",
    };
  };

  const vinylSize = detailSize;

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
        {albumsQuery.isLoading ? (
          <div
            style={{
              marginTop: 6,
              color: "rgba(255,255,255,0.42)",
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            loading albums…
          </div>
        ) : null}
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
          <div
            key={track.id}
            style={getCardStyle(index)}
            onClick={() => {
              if (index === activeIndex) {
                setView("detail");
              } else {
                setActiveIndex(index);
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
                boxShadow: index === activeIndex
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
                  color: index === activeIndex ? "rgba(255,255,255,1)" : "rgba(255,255,255,0.9)",
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
                  color: index === activeIndex ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.45)",
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
      <div
        onClick={() => setView("queue")}
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
              transition:
                "left 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
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
              textShadow: "0 1px 3px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.15)",
              opacity: view === "detail" ? 1 : 0,
              transform: view === "detail" ? "translateY(0)" : "translateY(12px)",
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
