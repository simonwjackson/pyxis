/**
 * @module QueueSearch
 *
 * Search / results surface in the coverflow theme. The results ARE the deck:
 * this delegates to {@link QueueCoverflowReady}, the same organism the Queue
 * Coverflow page uses, so results look and feel exactly like the main surface --
 * on a taller-than-wide frame the covers stack top-to-bottom and you pull up /
 * push down to scrub through them; on a wider frame they flow horizontally.
 * The only addition is a minimal search field in the deck's header slot.
 *
 * Three states of one surface:
 *   - "idle"     the field over a deck of RECENT covers
 *   - "loading"  the field (status: searching) over the deck
 *   - "results"  the field (status: N results) over the deck of matches
 *
 * Rendered with no `forcedState` it is live: type to debounce, see the status
 * flip to searching then to a result count, and the deck repopulate.
 */

import { useEffect, useRef, useState } from "react";
import { QUEUE_COVERFLOW_PREVIEW_TRACKS } from "./QueueCoverflowFixtures";
import { QueueCoverflowReady } from "./QueueCoverflowReady";
import type { QueueCoverflowTrack } from "./QueueCoverflowState";

export type QueueSearchState = "idle" | "loading" | "results";

const BASE = QUEUE_COVERFLOW_PREVIEW_TRACKS;

/** A larger synthetic result set (the fixture has only 7 covers) so scrubbing
 * through matches reads like a real search. Deterministic; ids stay unique. */
function buildResults(n: number): QueueCoverflowTrack[] {
  return Array.from({ length: n }, (_, i) => {
    const b = BASE[i % BASE.length];
    if (!b) throw new Error("empty base fixtures");
    return { ...b, id: `${b.id}-r${i}` };
  });
}

const TOTAL = 128;
const RESULTS = buildResults(14);

const FIELD_CSS = `
.qs-field { color: rgba(255,255,255,0.92); background: transparent; border: none; outline: none; }
.qs-field::placeholder { color: rgba(255,255,255,0.32); }
@keyframes qs-blink { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }
.qs-dot { animation: qs-blink 1s ease-in-out infinite; }
`;

function useDebounced<T>(value: T, delayMs: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return v;
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

/** The minimal chrome: one hairline field plus a tiny status kicker. Wrapped in
 * `.pyxis-intrinsic` so its type/space derive from the deck's own container. */
function SearchField({
  value,
  onChange,
  onClear,
  status,
  loading,
  readOnly,
  inputRef,
}: {
  readonly value: string;
  readonly onChange: (v: string) => void;
  readonly onClear: () => void;
  readonly status: string;
  readonly loading: boolean;
  readonly readOnly: boolean;
  readonly inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div
      className="pyxis-intrinsic"
      style={{
        fontFamily: "'Urbanist', system-ui, sans-serif",
        fontSize: "var(--pyxis-text-body)",
        padding:
          "var(--pyxis-space-4) var(--pyxis-space-4) var(--pyxis-space-2)",
      }}
    >
      <style>{FIELD_CSS}</style>
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
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="search"
          readOnly={readOnly}
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: "inherit",
            fontSize: "var(--pyxis-text-title)",
            fontWeight: 300,
            letterSpacing: "-0.01em",
          }}
        />
        {value.trim() !== "" && (
          <button
            type="button"
            onClick={onClear}
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--pyxis-space-1)",
          paddingTop: "var(--pyxis-space-2)",
          color: "rgba(255,255,255,0.5)",
          fontSize: "var(--pyxis-text-fine)",
          fontWeight: 600,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}
      >
        {loading && <span className="qs-dot">●</span>}
        <span>{status}</span>
      </div>
    </div>
  );
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

  const tracks = state === "idle" ? BASE : RESULTS;
  const status =
    state === "idle"
      ? "recent"
      : state === "loading"
        ? `searching · ${query}`
        : `${TOTAL} results · ${query}`;

  return (
    <QueueCoverflowReady
      // Remount when the shown set changes so the deck re-centers on the first
      // match instead of holding a stale scrub position.
      key={state === "idle" ? "recent" : "results"}
      tracks={tracks}
      initialIndex={0}
      captionVariant="editorial"
      header={
        <SearchField
          value={forcedQuery ?? raw}
          onChange={setRaw}
          onClear={() => {
            setRaw("");
            inputRef.current?.focus();
          }}
          status={status}
          loading={state === "loading"}
          readOnly={forcedQuery != null}
          inputRef={inputRef}
        />
      }
    />
  );
}
