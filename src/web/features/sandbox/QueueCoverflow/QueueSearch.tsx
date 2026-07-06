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
 * The search chrome is deliberately de-emphasized. At rest there is NO input
 * box: the query reads as editorial text (a light heading + kicker, like the
 * deck's caption) next to a lone search icon. Tapping the icon enters a
 * distinct "active" state where the input opens; leaving it returns to the
 * editorial text. So the art stays the subject and search is a quiet affordance.
 *
 * Three content states, independent of active/resting:
 *   - "idle"     a deck of RECENT covers
 *   - "loading"  status reads "searching"
 *   - "results"  status reads "N results"
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

const KICKER: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--pyxis-space-1)",
  color: "rgba(255,255,255,0.5)",
  fontSize: "var(--pyxis-text-fine)",
  fontWeight: 600,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
};

const HEADER_PAD =
  "var(--pyxis-space-4) var(--pyxis-space-4) var(--pyxis-space-2)";

/** Resting header: the search area as quiet editorial text + a lone icon. No
 * box. Tapping anywhere on it enters the active input state. Wrapped in
 * `.pyxis-intrinsic` so type/space derive from the deck's own container. */
function RestingHeader({
  query,
  status,
  loading,
  onOpen,
}: {
  readonly query: string;
  readonly status: string;
  readonly loading: boolean;
  readonly onOpen: () => void;
}) {
  return (
    <div
      className="pyxis-intrinsic"
      style={{
        fontFamily: "'Urbanist', system-ui, sans-serif",
        fontSize: "var(--pyxis-text-body)",
        padding: HEADER_PAD,
      }}
    >
      <style>{FIELD_CSS}</style>
      <button
        type="button"
        onClick={onOpen}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--pyxis-space-3)",
          width: "100%",
          background: "transparent",
          border: "none",
          padding: 0,
          margin: 0,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <SearchGlyph />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={KICKER}>
            {loading && <span className="qs-dot">●</span>}
            <span>{status}</span>
          </div>
          <div
            style={{
              color:
                query === ""
                  ? "rgba(255,255,255,0.32)"
                  : "rgba(255,255,255,0.9)",
              fontSize: "var(--pyxis-text-title)",
              fontWeight: 300,
              letterSpacing: "-0.01em",
              textTransform: "lowercase",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {query === "" ? "search" : query}
          </div>
        </div>
      </button>
    </div>
  );
}

/** Active header: the input, only present while you are "in search". */
function ActiveHeader({
  value,
  onChange,
  onClose,
  readOnly,
  inputRef,
}: {
  readonly value: string;
  readonly onChange: (v: string) => void;
  readonly onClose: () => void;
  readonly readOnly: boolean;
  readonly inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div
      className="pyxis-intrinsic"
      style={{
        fontFamily: "'Urbanist', system-ui, sans-serif",
        fontSize: "var(--pyxis-text-body)",
        padding: HEADER_PAD,
      }}
    >
      <style>{FIELD_CSS}</style>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--pyxis-space-3)",
          paddingBottom: "var(--pyxis-space-2)",
          borderBottom: "1px solid rgba(255,255,255,0.24)",
        }}
      >
        <SearchGlyph />
        <input
          ref={inputRef}
          className="qs-field"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") onClose();
          }}
          placeholder="search"
          readOnly={readOnly}
          // biome-ignore lint/a11y/noAutofocus: entering the search state should place the caret in the field.
          autoFocus
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: "inherit",
            fontSize: "var(--pyxis-text-title)",
            fontWeight: 300,
            letterSpacing: "-0.01em",
          }}
        />
        <button
          type="button"
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 0,
            color: "rgba(255,255,255,0.6)",
            fontSize: "var(--pyxis-text-fine)",
            fontWeight: 600,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

export function QueueSearch({
  forcedState,
  forcedQuery,
  forcedActive,
}: {
  readonly forcedState?: QueueSearchState;
  readonly forcedQuery?: string;
  /** Force the input open (active) or closed (resting) for template snapshots.
   * Omitted = interactive: tapping the icon opens it, Done/Enter closes it. */
  readonly forcedActive?: boolean;
}) {
  const [raw, setRaw] = useState(forcedQuery ?? "");
  const debounced = useDebounced(raw, 320);
  const [settling, setSettling] = useState(false);
  const [active, setActive] = useState(false);
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
        ? "searching"
        : `${TOTAL} results`;

  const isActive = forcedActive ?? active;

  return (
    <QueueCoverflowReady
      // Remount when the shown set changes so the deck re-centers on the first
      // match instead of holding a stale scrub position.
      key={state === "idle" ? "recent" : "results"}
      tracks={tracks}
      initialIndex={0}
      captionVariant="editorial"
      header={
        isActive ? (
          <ActiveHeader
            value={forcedQuery ?? raw}
            onChange={setRaw}
            onClose={() => setActive(false)}
            readOnly={forcedQuery != null}
            inputRef={inputRef}
          />
        ) : (
          <RestingHeader
            query={query}
            status={status}
            loading={state === "loading"}
            onOpen={() => setActive(true)}
          />
        )
      }
    />
  );
}
