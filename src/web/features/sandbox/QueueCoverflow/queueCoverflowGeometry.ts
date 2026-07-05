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

export interface CardStyleInput {
  readonly index: number;
  readonly activeIndex: number;
  readonly cardSize: number;
  readonly cardSpacing: number;
  readonly rotation: number;
  readonly axis?: CoverflowAxis;
}

export function cardStyle({
  index,
  activeIndex,
  cardSize,
  cardSpacing,
  rotation,
  axis = "x",
}: CardStyleInput): CSSProperties {
  const diff = index - activeIndex;
  const absDiff = Math.abs(diff);
  const isActive = index === activeIndex;
  const main = diff * cardSpacing;
  const zIndex = isActive ? 120 : 100 - Math.round(absDiff * 10);
  const scale = isActive ? 1.08 : 1;
  const opacity = isActive ? 1 : 0.55;
  // Portrait keeps every cover centered and upright (a clean stack of big
  // covers); the landscape fan tilts its neighbours and pops the active card up.
  const rotate = axis === "y" ? 0 : isActive ? 0 : rotation;
  const crossLift = axis === "y" ? 0 : isActive ? -8 : 0;

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
    marginTop: axis === "y" ? -cardSize / 2 : -cardSize / 2 - 16,
    transform: `${translate} rotate(${rotate}deg) scale(${scale})`,
    zIndex,
    opacity,
    transition:
      "transform 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.4s ease",
  };
}
