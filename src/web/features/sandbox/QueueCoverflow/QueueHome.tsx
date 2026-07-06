/**
 * @module QueueHome
 *
 * Home / browse landing surface in the coverflow theme's language: neutral
 * art-forward ground, BlurredBackdrop drawing color from a featured album,
 * captions in their own region (never over art), covers at full opacity. Every
 * size derives from the intrinsic-design generator (--pyxis-text-*,
 * --pyxis-space-*, --pyxis-base) so the five systemic knobs shape it whole.
 *
 * Three explorations of the same data:
 *   - "shelves"   hero + horizontal cover shelves (classic browse)
 *   - "editorial" magazine masthead + featured pick + auto-fill gallery
 *   - "carousel"  coverflow-forward hero carousel + compact shelves
 *
 * Pre-selection the art stands alone: non-focused covers carry NO text. The
 * only detail shown is for the prominent/focused album (hero, featured pick,
 * centered carousel item). Everything else reveals its title/artist only on
 * hover or keyboard focus, in its own reserved region below the cover -- never
 * painted over the art, never shifting neighbors.
 */

import { useEffect, useState } from "react";
import { BlurredBackdrop } from "./components/BlurredBackdrop";
import { QUEUE_COVERFLOW_PREVIEW_TRACKS } from "./QueueCoverflowFixtures";
import type { QueueCoverflowTrack } from "./QueueCoverflowState";

export type QueueHomeVariant = "shelves" | "editorial" | "carousel";

const ALBUMS = QUEUE_COVERFLOW_PREVIEW_TRACKS;

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
  fontSize: "var(--pyxis-text-body)",
};

const coverShadow = "0 1px 2px rgba(0,0,0,0.3), 0 10px 26px rgba(0,0,0,0.4)";

/* Hover/focus reveal for non-focused tiles. Captions sit in reserved space
 * below the cover (the shelf paddingBottom / grid row-gap), absolutely placed
 * so revealing them never reflows neighbors and never covers the art. */
const HOVER_CSS = `
.qh-tile { position: relative; }
.qh-tile-cap {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  padding-top: var(--pyxis-space-1);
  opacity: 0;
  transform: translateY(-6px);
  transition: opacity 0.2s ease, transform 0.2s ease;
  pointer-events: none;
}
.qh-tile:hover .qh-tile-cap,
.qh-tile:focus-within .qh-tile-cap {
  opacity: 1;
  transform: none;
}
.qh-tile:hover .qh-tile-art,
.qh-tile:focus-within .qh-tile-art {
  transform: scale(1.04);
}
`;

/** Title + artist shown only on hover/focus, in reserved space below a cover. */
function TileCaption({
  title,
  artist,
}: {
  readonly title: string;
  readonly artist: string;
}) {
  return (
    <div className="qh-tile-cap">
      <div
        style={{
          color: "rgba(255,255,255,0.9)",
          fontSize: "var(--pyxis-text-body)",
          fontWeight: 500,
          textTransform: "lowercase",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {title}
      </div>
      <div
        style={{
          color: "rgba(255,255,255,0.45)",
          fontSize: "var(--pyxis-text-fine)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {artist}
      </div>
    </div>
  );
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return v;
}

function Cover({
  track,
  size,
  radius = "var(--pyxis-space-1)",
  onSelect,
  className,
}: {
  readonly track: QueueCoverflowTrack;
  readonly size: string;
  readonly radius?: string;
  readonly onSelect?: () => void;
  readonly className?: string;
}) {
  return (
    <div
      className={className}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (onSelect && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect();
        }
      }}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      style={{
        width: size,
        aspectRatio: "1",
        flexShrink: 0,
        borderRadius: radius,
        overflow: "hidden",
        boxShadow: coverShadow,
        cursor: onSelect ? "pointer" : undefined,
        transition: "width 0.35s ease, transform 0.35s ease",
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

function Kicker({ children }: { readonly children: React.ReactNode }) {
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
      {children}
    </div>
  );
}

function SectionHeader({ children }: { readonly children: React.ReactNode }) {
  return (
    <div
      style={{
        color: "rgba(255,255,255,0.9)",
        fontSize: "var(--pyxis-text-title)",
        fontWeight: 300,
        letterSpacing: "-0.01em",
        textTransform: "lowercase",
        marginBottom: "var(--pyxis-space-2)",
      }}
    >
      {children}
    </div>
  );
}

function Title({
  children,
  size = "var(--pyxis-text-heading)",
}: {
  readonly children: React.ReactNode;
  readonly size?: string;
}) {
  return (
    <div
      style={{
        color: "rgba(255,255,255,0.98)",
        fontSize: size,
        fontWeight: 300,
        letterSpacing: "-0.02em",
        lineHeight: 1.02,
        textTransform: "lowercase",
      }}
    >
      {children}
    </div>
  );
}

/** Horizontal cover shelf: a section header + a scrolling row of covers with
 * captions below each. Covers derive width from the base. */
function Shelf({
  label,
  coverSize,
  onSelect,
}: {
  readonly label: string;
  readonly coverSize: string;
  readonly onSelect: (t: QueueCoverflowTrack) => void;
}) {
  return (
    <div style={{ marginTop: "var(--pyxis-space-5)" }}>
      <div style={{ paddingInline: "var(--pyxis-space-5)" }}>
        <SectionHeader>{label}</SectionHeader>
      </div>
      <div
        style={{
          display: "flex",
          gap: "var(--pyxis-space-3)",
          overflowX: "auto",
          scrollbarWidth: "none",
          paddingInline: "var(--pyxis-space-5)",
          paddingTop: "var(--pyxis-space-1)",
          paddingBottom: "calc(var(--pyxis-base) * 3.4)",
        }}
      >
        {ALBUMS.map((t) => (
          <div
            key={`${label}-${t.id}`}
            className="qh-tile"
            style={{ width: coverSize, flexShrink: 0 }}
          >
            <Cover
              className="qh-tile-art"
              track={t}
              size={coverSize}
              onSelect={() => onSelect(t)}
            />
            <TileCaption title={t.title} artist={t.artist} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function QueueHome({ variant }: { readonly variant: QueueHomeVariant }) {
  const [featured, setFeatured] = useState(0);
  const hero = ALBUMS[featured] ?? ALBUMS[0];
  const heroArtwork = useDebounced(hero?.artwork ?? "", 300);

  return (
    <div style={rootStyle}>
      <style>{HOVER_CSS}</style>
      <BlurredBackdrop artwork={heroArtwork} />
      <div className="pyxis-intrinsic" style={scrollStyle}>
        {variant === "shelves" && (
          <ShelvesHome
            hero={hero}
            onSelect={(t) => setFeatured(ALBUMS.indexOf(t))}
          />
        )}
        {variant === "editorial" && (
          <EditorialHome featured={featured} onSelect={(i) => setFeatured(i)} />
        )}
        {variant === "carousel" && (
          <CarouselHome featured={featured} onSelect={(i) => setFeatured(i)} />
        )}
      </div>
    </div>
  );
}

/* ── Variant A: Shelves ─────────────────────────────────────────────────── */

function ShelvesHome({
  hero,
  onSelect,
}: {
  readonly hero: QueueCoverflowTrack | undefined;
  readonly onSelect: (t: QueueCoverflowTrack) => void;
}) {
  if (!hero) return null;
  return (
    <div style={{ paddingBlock: "var(--pyxis-space-5)" }}>
      <div style={{ paddingInline: "var(--pyxis-space-5)" }}>
        <Kicker>good evening</Kicker>
      </div>
      {/* Hero: cover beside its own caption region (art stands alone). */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: "var(--pyxis-space-4)",
          padding: "var(--pyxis-space-3) var(--pyxis-space-5) 0",
        }}
      >
        <Cover
          track={hero}
          size="min(42cqw, calc(var(--pyxis-base) * 15))"
          radius="var(--pyxis-space-2)"
          onSelect={() => onSelect(hero)}
        />
        <div
          style={{
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: "var(--pyxis-space-1)",
            paddingBottom: "var(--pyxis-space-1)",
          }}
        >
          <Kicker>{hero.artist}</Kicker>
          <Title>{hero.title}</Title>
          <div
            style={{
              marginTop: "var(--pyxis-space-2)",
              alignSelf: "flex-start",
              padding: "var(--pyxis-space-1) var(--pyxis-space-3)",
              borderRadius: "999px",
              background: "rgba(255,255,255,0.14)",
              color: "#fff",
              fontSize: "var(--pyxis-text-fine)",
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            ▶ play
          </div>
        </div>
      </div>
      <Shelf
        label="recently played"
        coverSize="calc(var(--pyxis-base) * 8)"
        onSelect={onSelect}
      />
      <Shelf
        label="from your collection"
        coverSize="calc(var(--pyxis-base) * 8)"
        onSelect={onSelect}
      />
      <Shelf
        label="discovery"
        coverSize="calc(var(--pyxis-base) * 6)"
        onSelect={onSelect}
      />
    </div>
  );
}

/* ── Variant B: Editorial ───────────────────────────────────────────────── */

function EditorialHome({
  featured,
  onSelect,
}: {
  readonly featured: number;
  readonly onSelect: (i: number) => void;
}) {
  const pick = ALBUMS[featured] ?? ALBUMS[0];
  if (!pick) return null;
  return (
    <div style={{ padding: "var(--pyxis-space-6) var(--pyxis-space-5)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "var(--pyxis-space-3)",
        }}
      >
        <Title size="var(--pyxis-text-heading)">listening</Title>
        <Kicker>tonight</Kicker>
      </div>

      {/* Featured pick: big cover + editorial caption block, own regions. */}
      <div
        style={{
          marginTop: "var(--pyxis-space-4)",
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--pyxis-space-4)",
          alignItems: "flex-end",
        }}
      >
        <Cover
          track={pick}
          size="min(58cqw, calc(var(--pyxis-base) * 20))"
          radius="var(--pyxis-space-2)"
          onSelect={() => onSelect(featured)}
        />
        <div
          style={{
            flex: "1 1 40%",
            minWidth: "min(100%, calc(var(--pyxis-base) * 12))",
            display: "flex",
            flexDirection: "column",
            gap: "var(--pyxis-space-2)",
          }}
        >
          <Kicker>featured · {pick.artist}</Kicker>
          <Title size="var(--pyxis-text-display)">{pick.title}</Title>
          <div
            style={{
              color: "rgba(255,255,255,0.55)",
              fontSize: "var(--pyxis-text-body)",
              lineHeight: 1.4,
              maxWidth: "42ch",
            }}
          >
            A slow-burning set that drifts between rooms — picked for the hour.
          </div>
        </div>
      </div>

      {/* Auto-fill gallery: columns derive from base + container width. */}
      <div style={{ marginTop: "var(--pyxis-space-6)" }}>
        <Kicker>the shelf</Kicker>
        <div
          style={{
            marginTop: "var(--pyxis-space-3)",
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fill, minmax(calc(var(--pyxis-base) * 7), 1fr))",
            columnGap: "var(--pyxis-space-3)",
            rowGap: "calc(var(--pyxis-base) * 3.4)",
          }}
        >
          {ALBUMS.map((t, i) => (
            <div key={t.id} className="qh-tile">
              <Cover
                className="qh-tile-art"
                track={t}
                size="100%"
                onSelect={() => onSelect(i)}
              />
              <TileCaption title={t.title} artist={t.artist} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Variant C: Carousel ────────────────────────────────────────────────── */

function CarouselHome({
  featured,
  onSelect,
}: {
  readonly featured: number;
  readonly onSelect: (i: number) => void;
}) {
  const active = ALBUMS[featured] ?? ALBUMS[0];
  if (!active) return null;
  return (
    <div style={{ paddingBlock: "var(--pyxis-space-6)" }}>
      <div style={{ paddingInline: "var(--pyxis-space-5)" }}>
        <Kicker>hot right now</Kicker>
      </div>

      {/* Peeked carousel: active cover larger, neighbors smaller (full opacity;
       * emphasis by scale + separation, never dimming). */}
      <div
        style={{
          marginTop: "var(--pyxis-space-3)",
          display: "flex",
          alignItems: "center",
          gap: "var(--pyxis-space-3)",
          overflowX: "auto",
          scrollbarWidth: "none",
          paddingInline: "var(--pyxis-space-5)",
        }}
      >
        {ALBUMS.map((t, i) => (
          <Cover
            key={t.id}
            track={t}
            size={
              i === featured
                ? "min(60cqw, calc(var(--pyxis-base) * 18))"
                : "calc(var(--pyxis-base) * 11)"
            }
            radius="var(--pyxis-space-2)"
            onSelect={() => onSelect(i)}
          />
        ))}
      </div>

      {/* Caption region for the centered album (art stays clean above). */}
      <div
        style={{
          padding: "var(--pyxis-space-4) var(--pyxis-space-5) 0",
          display: "flex",
          flexDirection: "column",
          gap: "var(--pyxis-space-1)",
        }}
      >
        <Kicker>
          {active.artist} · {featured + 1} / {ALBUMS.length}
        </Kicker>
        <Title size="var(--pyxis-text-display)">{active.title}</Title>
      </div>

      <Shelf
        label="jump back in"
        coverSize="calc(var(--pyxis-base) * 6)"
        onSelect={(t) => onSelect(ALBUMS.indexOf(t))}
      />
    </div>
  );
}
