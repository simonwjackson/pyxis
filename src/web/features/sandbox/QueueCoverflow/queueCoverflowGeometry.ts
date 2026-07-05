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
 * - Portrait flow (`y`): a large fraction of the WIDTH so the active album
 *   nearly fills the frame and the queue reads as a stack of big covers.
 */
export function computeCardSize(
  containerWidth: number,
  containerHeight: number,
  axis: CoverflowAxis = "x",
): number {
  if (axis === "y") {
    return Math.max(96, Math.min(containerWidth * 0.84, 420));
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
export function cardSpacingFor(cardSize: number, axis: CoverflowAxis): number {
  return cardSize * (axis === "y" ? 0.62 : 0.9);
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
  readonly cardSpacing: number;
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
  cardSpacing,
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
  const main = diff * cardSpacing;
  const scale = 1 + 0.08 * proximity;
  const opacity = 0.55 + 0.45 * proximity;
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
