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
 * Card edge length as a fraction of the container's smaller side, clamped so it
 * stays legible on a tiny handheld and never dominates a large display.
 */
export function computeCardSize(
  containerWidth: number,
  containerHeight: number,
): number {
  const base = Math.min(containerWidth, containerHeight) * 0.34;
  return Math.max(64, Math.min(base, 300));
}

export function computeDetailSize(
  containerWidth: number,
  containerHeight: number,
): number {
  return Math.min(containerWidth * 0.55, containerHeight * 0.75);
}

export interface CardStyleInput {
  readonly index: number;
  readonly activeIndex: number;
  readonly cardSize: number;
  readonly cardSpacing: number;
  readonly rotation: number;
}

export function cardStyle({
  index,
  activeIndex,
  cardSize,
  cardSpacing,
  rotation,
}: CardStyleInput): CSSProperties {
  const diff = index - activeIndex;
  const absDiff = Math.abs(diff);
  const isActive = index === activeIndex;
  const translateX = diff * cardSpacing;
  const zIndex = isActive ? 120 : 100 - Math.round(absDiff * 10);
  const rotate = isActive ? 0 : rotation;
  const scale = isActive ? 1.08 : 1;
  const translateY = isActive ? -8 : 0;
  const opacity = isActive ? 1 : 0.55;

  return {
    position: "absolute",
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
}
