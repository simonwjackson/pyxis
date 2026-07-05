/**
 * @module queueCoverflowGeometry
 *
 * Pure geometry for the Queue cover-flow layout: container-derived card sizes,
 * the deterministic per-card resting rotation, and the transform/opacity of a
 * card relative to the active one. Sizes are always a fraction of the surface
 * CONTAINER (the device frame), never the window, so the layout is intrinsic:
 * it scales to whatever device it is mounted in with no media queries. Kept
 * side-effect free so it can be unit tested without a DOM.
 */

import type { CSSProperties } from "react";

export function seededRotation(index: number): number {
  const seed = Math.sin(index * 137.508 + 42) * 10000;
  return (seed - Math.floor(seed) - 0.5) * 14;
}

/**
 * Card edge length, derived from the container.
 *
 * - Landscape fan (`x`): a fraction of the SMALLER side so several cards read at
 *   once, clamped to stay legible on a handheld and modest on a big display.
 * - Portrait flow (`y`): a fraction of the WIDTH large enough that the active
 *   album dominates, but leaving vertical room for a stack of lips above and
 *   below it rather than filling the whole frame.
 */
export function computeCardSize(
  containerWidth: number,
  containerHeight: number,
  axis: CoverflowAxis = "x",
): number {
  if (axis === "y") {
    return Math.max(88, Math.min(containerWidth * 0.66, 320));
  }
  const base = Math.min(containerWidth, containerHeight) * 0.34;
  return Math.max(64, Math.min(base, 300));
}

export function computeDetailSize(
  containerWidth: number,
  containerHeight: number,
): number {
  return Math.min(containerWidth * 0.55, containerHeight * 0.75);
}

/** Flow direction of the cover-flow: cards fan horizontally in a landscape
 * container and reflow vertically (top-to-bottom) in a portrait one. Derived
 * from the container's own aspect ratio — never a screen media query. */
export type CoverflowAxis = "x" | "y";

export function coverflowAxis(
  containerWidth: number,
  containerHeight: number,
): CoverflowAxis {
  return containerHeight > containerWidth ? "y" : "x";
}

/** Neighbour-to-neighbour spacing, always a fraction of the card so cards
 * OVERLAP into a compact stack rather than spreading apart. The active card
 * (top z-index, scaled up) therefore stays fully visible while its neighbours
 * tuck behind it. Vertical flow is tighter still so tall handheld frames don't
 * strand the cards far apart. */
/**
 * Per-axis spacing profile, as fractions of the card size:
 * - `center`: spacing right around the active card, so it stands on its own.
 * - `compressed`: the tight spacing far from centre, so the rest pack like a
 *   flipped-through record bin and many are visible at once.
 * - `softness`: how quickly spacing eases from centre to compressed (cards).
 * Landscape keeps a uniform fan (center === compressed).
 */
interface CoverflowSpacing {
  readonly center: number;
  readonly softness: number;
  /** An extra "moat" pushed onto every non-active card so the active album
   * lifts clear of the pack. Applied as a fast-saturating step. */
  readonly separation: number;
  readonly separationSoftness: number;
}

const SPACING_PROFILES: Record<CoverflowAxis, CoverflowSpacing> = {
  y: { center: 0.3, softness: 0.5, separation: 0.08, separationSoftness: 0.5 },
  x: { center: 0.9, softness: 1, separation: 0, separationSoftness: 1 },
};

// Portrait far-spacing (the tight pack) as a fraction of the cover, scaled by
// cover size: on small covers (small screens) it collapses to a thin lip so
// only a slice of each non-selected album shows and many stack up; big covers
// ease open. Landscape keeps its uniform fan.
const PORTRAIT_COMPRESSED_MIN = 0.04;
const PORTRAIT_COMPRESSED_MAX = 0.14;
const PORTRAIT_CARD_MIN = 118;
const PORTRAIT_CARD_MAX = 280;

function compressedFor(axis: CoverflowAxis, cardSize: number): number {
  if (axis === "x") return SPACING_PROFILES.x.center;
  const t = Math.min(
    1,
    Math.max(
      0,
      (cardSize - PORTRAIT_CARD_MIN) / (PORTRAIT_CARD_MAX - PORTRAIT_CARD_MIN),
    ),
  );
  return (
    PORTRAIT_COMPRESSED_MIN +
    (PORTRAIT_COMPRESSED_MAX - PORTRAIT_COMPRESSED_MIN) * t
  );
}

/** Drag/step spacing: the effective spacing right at the centre (including the
 * separation moat) so a one-card drag near the active tracks the finger 1:1. */
export function cardSpacingFor(cardSize: number, axis: CoverflowAxis): number {
  const p = SPACING_PROFILES[axis];
  return cardSize * (p.center + p.separation / p.separationSoftness);
}

/**
 * Main-axis pixel offset of a card from the active one. Full spacing near the
 * centre easing to a tight constant spacing far out (tanh compression), plus a
 * fast-saturating separation moat that lifts every non-active card clear of the
 * active album — so it reads as: active → gap → compressed browsable stack.
 */
export function cardMainOffset(
  diff: number,
  cardSize: number,
  axis: CoverflowAxis,
): number {
  const { center, softness, separation, separationSoftness } =
    SPACING_PROFILES[axis];
  const compressed = compressedFor(axis, cardSize);
  const gain = (center - compressed) * softness;
  return (
    cardSize *
    (compressed * diff +
      gain * Math.tanh(diff / softness) +
      separation * Math.tanh(diff / separationSoftness))
  );
}

/**
 * Resolve the active index while dragging: a drag along the flow axis of one
 * card-spacing moves one card. Dragging up/left (negative delta) advances to
 * later cards, like pushing a stack. Always clamped to the queue bounds.
 */
export function stepIndexFromDelta(
  startIndex: number,
  deltaPx: number,
  stepPx: number,
  count: number,
): number {
  if (count <= 0) return 0;
  const maxIndex = count - 1;
  if (!(stepPx > 0) || !Number.isFinite(deltaPx)) {
    return Math.min(Math.max(0, startIndex), maxIndex);
  }
  const steps = Math.round(deltaPx / stepPx);
  return Math.min(Math.max(0, startIndex - steps), maxIndex);
}

/** How much of the seeded fan tilt the portrait stack keeps — subtle, so big
 * centred covers lean just enough to read as an organic offset stack. */
export const PORTRAIT_TILT = 0.45;

export interface CardStyleInput {
  readonly index: number;
  readonly activeIndex: number;
  readonly cardSize: number;
  readonly rotation: number;
  readonly axis?: CoverflowAxis;
  /** While true, transitions are suppressed so the drag tracks 1:1; on release
   * it flips false and cards ease to their snapped positions. */
  readonly dragging?: boolean;
}

export function cardStyle({
  index,
  activeIndex,
  cardSize,
  rotation,
  axis = "x",
  dragging = false,
}: CardStyleInput): CSSProperties {
  const diff = index - activeIndex;
  const distance = Math.abs(diff);
  // 1 when a card is dead-centre, falling to 0 one card away. Drives the live
  // "reselection" feel: the card nearest centre grows, brightens, straightens,
  // and rises as you drag it in. Fractional activeIndex makes it continuous.
  const proximity = Math.max(0, 1 - distance);
  const main = cardMainOffset(diff, cardSize, axis);
  const scale = 1 + 0.12 * proximity;
  // Covers always render at full opacity — no dimming of non-active cards.
  const opacity = 1;
  const zIndex = Math.round(120 - distance * 20);
  // Seeded tilt (portrait damped) easing to upright at centre; the cross-axis
  // lift pops the centred card without shifting it sideways.
  const rotate =
    rotation * (axis === "y" ? PORTRAIT_TILT : 1) * Math.min(1, distance);
  const crossLift = axis === "y" ? 0 : -8 * proximity;

  const translate =
    axis === "y"
      ? `translateY(${main}px)`
      : `translateX(${main}px) translateY(${crossLift}px)`;

  return {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: cardSize,
    marginLeft: -cardSize / 2,
    marginTop: -cardSize / 2,
    transform: `${translate} rotate(${rotate}deg) scale(${scale})`,
    zIndex,
    opacity,
    transition: dragging
      ? "none"
      : "transform 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.4s ease",
  };
}
