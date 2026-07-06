/**
 * @module QueueAlbumDetail
 *
 * Album-detail surface in the coverflow theme. The album's identity and art are
 * the hero — a tracklist is NEVER the default view. Each variation leads with
 * cover/vinyl + identity + transport, and only reveals songs behind an explicit
 * gesture. Sizes derive from the intrinsic-design generator (--pyxis-text-*,
 * --pyxis-space-*, --pyxis-base); color comes from BlurredBackdrop.
 *
 *   - "sleeve"    immersive centered cover, identity + transport below
 *   - "marquee"   editorial cover-beside-identity + "more from" cover shelf
 *   - "turntable" the album as a record half-pulled from its sleeve
 */

import { useLayoutEffect, useRef, useState } from "react";
import { BlurredBackdrop } from "./components/BlurredBackdrop";
import { VinylRecord } from "./components/VinylRecord";
import { QUEUE_COVERFLOW_PREVIEW_TRACKS } from "./QueueCoverflowFixtures";
import { colorFromId, type QueueCoverflowTrack } from "./QueueCoverflowState";

export type QueueAlbumDetailVariant = "sleeve" | "marquee" | "turntable";

const TRACKS = QUEUE_COVERFLOW_PREVIEW_TRACKS;
const ALBUM = {
  title: "Coastal Signals",
  artist: "Luna Mars",
  year: 2024,
  artwork: TRACKS[0]?.artwork ?? "",
  color: colorFromId(TRACKS[0]?.id ?? "album"),
  songCount: TRACKS.length,
  runtimeMin: Math.round(TRACKS.length * 3.8),
};

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
  color: "#fff",
};

const coverShadow = "0 2px 6px rgba(0,0,0,0.35), 0 18px 48px rgba(0,0,0,0.5)";

function useBoxSize(ref: React.RefObject<HTMLElement | null>) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return box;
}

function Kicker({ children }: { readonly children: React.ReactNode }) {
  return (
    <div
      style={{
        color: "rgba(255,255,255,0.55)",
        fontSize: "var(--pyxis-text-fine)",
        fontWeight: 600,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        maxWidth: "100%",
        overflowWrap: "anywhere",
      }}
    >
      {children}
    </div>
  );
}

function AlbumTitle({ size }: { readonly size: string }) {
  return (
    <div
      style={{
        fontSize: size,
        fontWeight: 300,
        letterSpacing: "-0.025em",
        // Room for descenders (g/y/p) so large display text never clips, and
        // wrap anywhere so a long/unbreakable title can never overflow.
        lineHeight: 1.1,
        textTransform: "lowercase",
        maxWidth: "100%",
        overflowWrap: "anywhere",
        wordBreak: "break-word",
        paddingBottom: "0.08em",
      }}
    >
      {ALBUM.title}
    </div>
  );
}

function Meta() {
  return (
    <div
      style={{
        color: "rgba(255,255,255,0.5)",
        fontSize: "var(--pyxis-text-body)",
        fontWeight: 500,
        maxWidth: "100%",
        overflowWrap: "anywhere",
      }}
    >
      {ALBUM.year} · {ALBUM.songCount} songs · {ALBUM.runtimeMin} min
    </div>
  );
}

function Transport({ compact = false }: { readonly compact?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--pyxis-space-3)",
        marginTop: "var(--pyxis-space-3)",
      }}
    >
      <div
        role="button"
        tabIndex={0}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--pyxis-space-1)",
          padding: "var(--pyxis-space-2) var(--pyxis-space-5)",
          borderRadius: "999px",
          background: "#fff",
          color: "#0b0b0e",
          fontSize: "var(--pyxis-text-body)",
          fontWeight: 700,
          letterSpacing: "0.02em",
          textTransform: "uppercase",
          cursor: "pointer",
        }}
      >
        ▶ play
      </div>
      <div
        role="button"
        tabIndex={0}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--pyxis-space-1)",
          padding: "var(--pyxis-space-2) var(--pyxis-space-4)",
          borderRadius: "999px",
          background: "rgba(255,255,255,0.12)",
          color: "#fff",
          fontSize: "var(--pyxis-text-body)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.02em",
          cursor: "pointer",
        }}
      >
        ⤨ shuffle
      </div>
      {!compact && (
        <div
          role="button"
          tabIndex={0}
          style={{
            width: "calc(var(--pyxis-base) * 2.4)",
            height: "calc(var(--pyxis-base) * 2.4)",
            display: "grid",
            placeItems: "center",
            borderRadius: "999px",
            border: "1px solid rgba(255,255,255,0.25)",
            color: "#fff",
            fontSize: "var(--pyxis-text-title)",
            cursor: "pointer",
          }}
        >
          ♡
        </div>
      )}
    </div>
  );
}

/** Collapsed-by-default songs affordance. The list is NOT the default view; it
 * only exists once the listener explicitly opens it. */
function SongsReveal() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: "var(--pyxis-space-5)" }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "var(--pyxis-space-2) 0",
          borderTop: "1px solid rgba(255,255,255,0.1)",
          color: "rgba(255,255,255,0.6)",
          fontSize: "var(--pyxis-text-fine)",
          fontWeight: 600,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          cursor: "pointer",
        }}
      >
        <span>{ALBUM.songCount} songs</span>
        <span>{open ? "▲ hide" : "▼ show"}</span>
      </div>
      {open && (
        <div style={{ paddingBottom: "var(--pyxis-space-4)" }}>
          {TRACKS.map((t, i) => (
            <div
              key={t.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--pyxis-space-3)",
                padding: "var(--pyxis-space-2) 0",
                color: "rgba(255,255,255,0.85)",
                fontSize: "var(--pyxis-text-body)",
              }}
            >
              <span
                style={{
                  color: "rgba(255,255,255,0.35)",
                  fontVariantNumeric: "tabular-nums",
                  width: "2ch",
                }}
              >
                {i + 1}
              </span>
              <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
                {t.title}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CoverShelf({ label }: { readonly label: string }) {
  return (
    <div style={{ marginTop: "var(--pyxis-space-6)" }}>
      <Kicker>{label}</Kicker>
      <div
        style={{
          marginTop: "var(--pyxis-space-3)",
          display: "flex",
          gap: "var(--pyxis-space-3)",
          overflowX: "auto",
          scrollbarWidth: "none",
        }}
      >
        {TRACKS.map((t) => (
          <div
            key={`shelf-${t.id}`}
            style={{
              width: "calc(var(--pyxis-base) * 7)",
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              gap: "var(--pyxis-space-1)",
            }}
          >
            <div
              style={{
                width: "100%",
                aspectRatio: "1",
                borderRadius: "var(--pyxis-space-1)",
                overflow: "hidden",
                boxShadow: coverShadow,
              }}
            >
              <img
                src={t.artwork}
                alt={t.title}
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
                color: "rgba(255,255,255,0.8)",
                fontSize: "var(--pyxis-text-fine)",
                textTransform: "lowercase",
                overflowWrap: "anywhere",
              }}
            >
              {t.title}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CoverArt({
  size,
  radius,
}: {
  readonly size: string;
  readonly radius: string;
}) {
  return (
    <div
      style={{
        width: size,
        aspectRatio: "1",
        borderRadius: radius,
        overflow: "hidden",
        boxShadow: coverShadow,
        flexShrink: 0,
      }}
    >
      <img
        src={ALBUM.artwork}
        alt={ALBUM.title}
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

export function QueueAlbumDetail({
  variant,
}: {
  readonly variant: QueueAlbumDetailVariant;
}) {
  return (
    <div style={rootStyle}>
      <BlurredBackdrop artwork={ALBUM.artwork} />
      <div className="pyxis-intrinsic" style={scrollStyle}>
        {variant === "sleeve" && <SleeveDetail />}
        {variant === "marquee" && <MarqueeDetail />}
        {variant === "turntable" && <TurntableDetail />}
      </div>
    </div>
  );
}

/* ── Sleeve: immersive centered cover ───────────────────────────────────── */

function SleeveDetail() {
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = useBoxSize(ref);
  // Wider than tall: a vertical cover-on-top stack can't fit, so lay the cover
  // beside the identity and cap it to the container height instead.
  const row = w > 0 && w > h;

  if (row) {
    return (
      <div
        ref={ref}
        style={{
          minHeight: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "var(--pyxis-space-5)",
          padding: "var(--pyxis-space-5)",
        }}
      >
        <CoverArt
          size="min(46cqw, 84cqh, calc(var(--pyxis-base) * 18))"
          radius="var(--pyxis-space-2)"
        />
        <div
          style={{
            flex: "1 1 auto",
            minWidth: 0,
            maxWidth: "calc(var(--pyxis-base) * 34)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--pyxis-space-1)",
          }}
        >
          <Kicker>{ALBUM.artist}</Kicker>
          <AlbumTitle size="var(--pyxis-text-heading)" />
          <Meta />
          <Transport />
          <SongsReveal />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      style={{
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        padding: "var(--pyxis-space-6) var(--pyxis-space-5)",
      }}
    >
      <CoverArt
        size="min(72cqmin, calc(var(--pyxis-base) * 26))"
        radius="var(--pyxis-space-2)"
      />
      <div
        style={{
          marginTop: "var(--pyxis-space-4)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--pyxis-space-1)",
          alignItems: "center",
        }}
      >
        <Kicker>{ALBUM.artist}</Kicker>
        <AlbumTitle size="var(--pyxis-text-display)" />
        <div style={{ marginTop: "var(--pyxis-space-1)" }}>
          <Meta />
        </div>
      </div>
      <Transport />
      <div style={{ width: "100%", maxWidth: "calc(var(--pyxis-base) * 30)" }}>
        <SongsReveal />
      </div>
    </div>
  );
}

/* ── Marquee: editorial cover beside identity + "more from" shelf ───────── */

function MarqueeDetail() {
  return (
    <div style={{ padding: "var(--pyxis-space-6) var(--pyxis-space-5)" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--pyxis-space-5)",
          alignItems: "flex-end",
        }}
      >
        <CoverArt
          size="min(52cqw, 84cqh, calc(var(--pyxis-base) * 22))"
          radius="var(--pyxis-space-2)"
        />
        <div
          style={{
            flex: "1 1 45%",
            minWidth: "min(100%, calc(var(--pyxis-base) * 14))",
            display: "flex",
            flexDirection: "column",
            gap: "var(--pyxis-space-2)",
          }}
        >
          <Kicker>album · {ALBUM.artist}</Kicker>
          <AlbumTitle size="var(--pyxis-text-display)" />
          <Meta />
          <div
            style={{
              color: "rgba(255,255,255,0.55)",
              fontSize: "var(--pyxis-text-body)",
              lineHeight: 1.4,
              maxWidth: "min(46ch, 100%)",
              overflowWrap: "anywhere",
            }}
          >
            Warm, unhurried and built for the last hour of daylight — the pair's
            most cohesive record yet.
          </div>
          <Transport />
        </div>
      </div>
      <CoverShelf label={`more from ${ALBUM.artist}`} />
    </div>
  );
}

/* ── Turntable: the album as a record pulled from its sleeve ─────────────── */

function RecordArt({
  coverPx,
  reservePeek = false,
}: {
  readonly coverPx: number;
  readonly reservePeek?: boolean;
}) {
  const vinylPx = Math.round(coverPx * 0.96);
  return (
    <div
      style={{
        position: "relative",
        // Never shrink: the record + cover are absolutely positioned, so a
        // collapsing box would let its art overflow under the identity text.
        flexShrink: 0,
        width: reservePeek ? Math.round(coverPx * 1.42) : coverPx,
        height: coverPx,
      }}
    >
      {/* Record slid out to the right, behind the sleeve. */}
      <div
        style={{
          position: "absolute",
          left: coverPx * 0.42,
          top: coverPx * 0.02,
          animation: "vinyl-spin 8s linear infinite",
        }}
      >
        <VinylRecord
          size={vinylPx}
          color={ALBUM.color}
          title={ALBUM.title}
          artist={ALBUM.artist}
          spinning={false}
        />
      </div>
      {/* The sleeve / cover in front. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: coverPx,
          height: coverPx,
          borderRadius: "var(--pyxis-space-2)",
          overflow: "hidden",
          boxShadow: coverShadow,
        }}
      >
        <img
          src={ALBUM.artwork}
          alt={ALBUM.title}
          draggable={false}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      </div>
    </div>
  );
}

/** Portrait hero: the opaque record is centered on screen over the ground; the
 * sleeve sits in front, off to the left, overlapping only the record's left rim
 * so the disc reads as sliding out of it. The sleeve is free to run off-screen
 * (the root clips it) — the record stays centered. No opacity blending. */
function RecordHeroArt({ recordPx }: { readonly recordPx: number }) {
  // Sleeve is a touch larger than the disc (as real vinyl is), so the record is
  // never bigger than its sleeve.
  const coverPx = Math.round(recordPx * 1.08);
  const overlap = Math.round(recordPx * 0.16);
  return (
    <div style={{ position: "relative", width: recordPx, height: recordPx }}>
      {/* Record: centered, behind, spinning — the hero. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          animation: "vinyl-spin 8s linear infinite",
        }}
      >
        <VinylRecord
          size={recordPx}
          color={ALBUM.color}
          title={ALBUM.title}
          artist={ALBUM.artist}
          spinning={false}
        />
      </div>
      {/* Sleeve: in front, off to the left, disc emerging from its mouth. */}
      <div
        style={{
          position: "absolute",
          left: overlap - coverPx,
          top: Math.round((recordPx - coverPx) / 2),
          width: coverPx,
          height: coverPx,
          zIndex: 2,
          borderRadius: "var(--pyxis-space-2)",
          overflow: "hidden",
          boxShadow: coverShadow,
        }}
      >
        <img
          src={ALBUM.artwork}
          alt={ALBUM.title}
          draggable={false}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      </div>
    </div>
  );
}

function TurntableDetail() {
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = useBoxSize(ref);
  // Wider than tall: the centered record + stacked identity can't fit, so lay
  // the record beside the identity and size it to the container height.
  const row = w > 0 && w > h;
  // In row mode the record + its slid-out peek (~1.42x the cover) must fit the
  // width beside the identity, not just the height — otherwise the art overflows
  // under the text. Cap by both axes.
  const coverPx = Math.round(
    row
      ? Math.max(120, Math.min((h || 320) * 0.82, (w || 320) * 0.42, 520))
      : Math.max(120, Math.min(Math.min(w || 320, h || 320) * 0.62, 520)),
  );

  if (row) {
    return (
      <div
        ref={ref}
        style={{
          minHeight: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "var(--pyxis-space-5)",
          padding: "var(--pyxis-space-5)",
        }}
      >
        <RecordArt coverPx={coverPx} reservePeek />
        <div
          style={{
            flex: "1 1 auto",
            minWidth: 0,
            maxWidth: "calc(var(--pyxis-base) * 34)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--pyxis-space-1)",
          }}
        >
          <Kicker>{ALBUM.artist}</Kicker>
          <AlbumTitle size="var(--pyxis-text-heading)" />
          <Meta />
          <Transport compact />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      style={{
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--pyxis-space-6) var(--pyxis-space-5)",
      }}
    >
      <div
        style={{
          width: "100%",
          flex: 1,
          minHeight: "min(60cqh, calc(var(--pyxis-base) * 26))",
          display: "grid",
          placeItems: "center",
        }}
      >
        <RecordHeroArt recordPx={coverPx} />
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: "var(--pyxis-space-1)",
        }}
      >
        <Kicker>{ALBUM.artist}</Kicker>
        <AlbumTitle size="var(--pyxis-text-heading)" />
        <div style={{ marginTop: "var(--pyxis-space-1)" }}>
          <Meta />
        </div>
        <Transport compact />
      </div>
    </div>
  );
}
