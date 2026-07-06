/**
 * @module QueueSearch
 *
 * Search / results surface in the coverflow theme's editorial language: the
 * "editorial footer" (a small uppercase kicker over a row/grid of pure-art
 * tiles) promoted into a full search page. The art IS the result -- chrome is
 * kept to a whisper: one hairline search field, tiny uppercase kickers for
 * counts/sections, and a single text affordance for "more". No cards, no
 * borders, no buttons around the art.
 *
 * Everything sizes from the intrinsic-design generator (--pyxis-text-*,
 * --pyxis-space-*, --pyxis-base); nothing keys off screen size.
 *
 * Three states of the same surface, so the whole flow is legible at a glance:
 *   - "idle"     resting: the field, then RECENT as an editorial-footer row
 *   - "loading"  a query is in flight: the grid fills with pulsing skeletons
 *   - "results"  the art grid, with a minimal "load more" / count footer
 *
 * Rendered with no `forcedState`, it is live: type into the field and it
 * debounces, shows the loading grid, then the results (and remembers the query
 * if you leave and come back within the session).
 */

import { useEffect, useRef, useState } from "react";
import { BlurredBackdrop } from "./components/BlurredBackdrop";
import { QUEUE_COVERFLOW_PREVIEW_TRACKS } from "./QueueCoverflowFixtures";
import type { QueueCoverflowTrack } from "./QueueCoverflowState";
import { seededRotation } from "./queueCoverflowGeometry";

export type QueueSearchState = "idle" | "loading" | "results";

const BASE = QUEUE_COVERFLOW_PREVIEW_TRACKS;

/** A larger synthetic result set (the fixture has only 7 covers) so the grid
 * and pagination read like a real search. Deterministic; ids stay unique. */
function buildResults(n: number): QueueCoverflowTrack[] {
  return Array.from({ length: n }, (_, i) => {
    const b = BASE[i % BASE.length];
    if (!b) throw new Error("empty base fixtures");
    return { ...b, id: `${b.id}-r${i}` };
  });
}

const PAGE = 18;
const TOTAL = 128;
const RESULTS = buildResults(PAGE);

/** The deck's off-center tilt, eased so neat grids read as "slightly off". */
function tilt(index: number): number {
  return Math.round(seededRotation(index) * 0.6 * 100) / 100;
}

const CSS = `
.qs-tile { position: relative; }
.qs-tile-cap {
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
.qs-tile:hover .qs-tile-cap,
.qs-tile:focus-within .qs-tile-cap { opacity: 1; transform: none; }
.qs-tile-art {
  transform: rotate(var(--rot, 0deg));
  transition: transform 0.35s ease;
  box-shadow: 0 1px 2px rgba(0,0,0,0.3), 0 10px 26px rgba(0,0,0,0.4);
}
.qs-tile:hover .qs-tile-art,
.qs-tile:focus-within .qs-tile-art {
  transform: rotate(var(--rot, 0deg)) scale(1.05);
}
.qs-field { color: rgba(255,255,255,0.92); }
.qs-field::placeholder { color: rgba(255,255,255,0.32); }
@keyframes qs-pulse { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.7; } }
.qs-skel {
  background: linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.13));
  animation: qs-pulse 1.4s ease-in-out infinite;
}
`;

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
  display: "flex",
  flexDirection: "column",
  gap: "var(--pyxis-space-6)",
  padding: "var(--pyxis-space-5) var(--pyxis-space-4)",
};

/* Column min is CONTAINER-relative (cqi), not base-relative. Base floors at a
 * px value for legibility, so `base * 7` is a fixed ~98px that can't shrink --
 * on the 179px Sony device that collapses the grid to one giant column. A cqi
 * clamp instead yields ~2 columns on the Sony, 3 on the compact phone, and
 * more as the frame grows, never one-per-row. */
const COL_MIN = "clamp(60px, 26cqi, 128px)";

const GRID: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: `repeat(auto-fill, minmax(${COL_MIN}, 1fr))`,
  columnGap: "var(--pyxis-space-2)",
  rowGap: "calc(var(--pyxis-base) * 2.6)",
};

function Kicker({
  children,
  dim = 0.5,
}: {
  readonly children: React.ReactNode;
  readonly dim?: number;
}) {
  return (
    <div
      style={{
        color: `rgba(255,255,255,${dim})`,
        fontSize: "var(--pyxis-text-fine)",
        fontWeight: 600,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

function SearchGlyph() {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      aria-hidden
      style={{
        fontSize: "var(--pyxis-text-title)",
        color: "rgba(255,255,255,0.5)",
        flexShrink: 0,
      }}
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
    </svg>
  );
}

function Tile({
  track,
  index,
}: {
  readonly track: QueueCoverflowTrack;
  readonly index: number;
}) {
  return (
    <div
      className="qs-tile"
      style={
        { ["--rot" as string]: `${tilt(index)}deg` } as React.CSSProperties
      }
    >
      <div
        className="qs-tile-art"
        role="button"
        tabIndex={0}
        style={{
          aspectRatio: "1",
          borderRadius: "var(--pyxis-space-1)",
          overflow: "hidden",
          cursor: "pointer",
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
      <div className="qs-tile-cap">
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
          {track.title}
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
          {track.artist}
        </div>
      </div>
    </div>
  );
}

function SkeletonTile({ index }: { readonly index: number }) {
  return (
    <div
      className="qs-skel"
      style={{
        aspectRatio: "1",
        borderRadius: "var(--pyxis-space-1)",
        transform: `rotate(${tilt(index)}deg)`,
        animationDelay: `${(index % 6) * 0.12}s`,
      }}
    />
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

export function QueueSearch({
  forcedState,
  forcedQuery,
}: {
  readonly forcedState?: QueueSearchState;
  readonly forcedQuery?: string;
}) {
  const [raw, setRaw] = useState(forcedQuery ?? "");
  const debounced = useDebounced(raw, 320);
  const [settling, setSettling] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Simulate a query round-trip: while the debounced value catches up to what
  // was typed (or right after it lands) show the loading grid, then results.
  const pending = raw.trim() !== debounced.trim();
  useEffect(() => {
    if (forcedState) return;
    if (debounced.trim() === "") return;
    setSettling(true);
    const id = setTimeout(() => setSettling(false), 500);
    return () => clearTimeout(id);
  }, [debounced, forcedState]);

  const query = (forcedQuery ?? raw).trim();
  const derived: QueueSearchState =
    query === "" ? "idle" : pending || settling ? "loading" : "results";
  const state = forcedState ?? derived;

  const backdrop = state === "idle" ? BASE[2] : RESULTS[0];

  return (
    <div style={rootStyle}>
      <style>{CSS}</style>
      {backdrop && <BlurredBackdrop artwork={backdrop.artwork} />}
      <div className="pyxis-intrinsic" style={scrollStyle}>
        {/* Field: the only persistent chrome, a single hairline. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--pyxis-space-3)",
            paddingBottom: "var(--pyxis-space-2)",
            borderBottom: "1px solid rgba(255,255,255,0.14)",
          }}
        >
          <SearchGlyph />
          <input
            ref={inputRef}
            className="qs-field"
            value={forcedQuery ?? raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="search"
            readOnly={forcedQuery != null}
            style={{
              flex: 1,
              minWidth: 0,
              background: "transparent",
              border: "none",
              outline: "none",
              fontFamily: "inherit",
              fontSize: "var(--pyxis-text-title)",
              fontWeight: 300,
              letterSpacing: "-0.01em",
            }}
          />
          {query !== "" && (
            <button
              type="button"
              onClick={() => {
                setRaw("");
                inputRef.current?.focus();
              }}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: 0,
                color: "rgba(255,255,255,0.5)",
                fontSize: "var(--pyxis-text-fine)",
                fontWeight: 600,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
              }}
            >
              Clear
            </button>
          )}
        </div>

        {state === "idle" && <IdleBody />}
        {state === "loading" && <LoadingBody query={query} />}
        {state === "results" && <ResultsBody query={query} />}
      </div>
    </div>
  );
}

/** Resting state: the editorial footer itself -- a small kicker over a row of
 * pure-art tiles of what you played last. Art, even before you type. */
function IdleBody() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--pyxis-space-3)",
      }}
    >
      <Kicker>Recent</Kicker>
      <div
        style={{
          display: "flex",
          gap: "var(--pyxis-space-3)",
          overflowX: "auto",
          scrollbarWidth: "none",
          paddingTop: "var(--pyxis-space-3)",
          paddingBottom: "calc(var(--pyxis-base) * 2.6)",
        }}
      >
        {BASE.map((t, i) => (
          <div
            key={t.id}
            className="qs-tile"
            style={
              {
                width: COL_MIN,
                flexShrink: 0,
                ["--rot" as string]: `${tilt(i)}deg`,
              } as React.CSSProperties
            }
          >
            <Tile track={t} index={i} />
          </div>
        ))}
      </div>
    </div>
  );
}

function LoadingBody({ query }: { readonly query: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--pyxis-space-4)",
      }}
    >
      <Kicker dim={0.4}>Searching · {query}</Kicker>
      <div style={GRID} aria-hidden>
        {Array.from({ length: PAGE }, (_, i) => (
          <SkeletonTile key={i} index={i} />
        ))}
      </div>
    </div>
  );
}

function ResultsBody({ query }: { readonly query: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--pyxis-space-4)",
      }}
    >
      <Kicker>
        {TOTAL} results · {query}
      </Kicker>
      <div style={GRID}>
        {RESULTS.map((t, i) => (
          <Tile key={t.id} track={t} index={i} />
        ))}
      </div>
      {/* Pagination as a whisper: one centered text affordance + a faint count.
       * The art keeps flowing; no page chrome competes with it. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "var(--pyxis-space-2)",
          paddingTop: "var(--pyxis-space-4)",
          paddingBottom: "var(--pyxis-space-6)",
        }}
      >
        <button
          type="button"
          style={{
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: "999px",
            padding: "var(--pyxis-space-2) var(--pyxis-space-5)",
            cursor: "pointer",
            color: "rgba(255,255,255,0.85)",
            fontSize: "var(--pyxis-text-fine)",
            fontWeight: 600,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          Load more
        </button>
        <Kicker dim={0.35}>
          {PAGE} of {TOTAL}
        </Kicker>
      </div>
    </div>
  );
}
