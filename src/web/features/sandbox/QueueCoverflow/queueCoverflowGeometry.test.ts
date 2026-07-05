import { describe, expect, it } from "bun:test";
import {
  cardStyle,
  computeCardSize,
  computeDetailSize,
  coverflowAxis,
  seededRotation,
  stepIndexFromDelta,
} from "./queueCoverflowGeometry.js";

describe("queueCoverflowGeometry", () => {
  it("sizes the landscape card from the container's smaller side, clamped 64..300", () => {
    expect(computeCardSize(120, 120)).toBe(64);
    expect(computeCardSize(4000, 4000)).toBe(300);
    expect(computeCardSize(1000, 800)).toBeCloseTo(272, 5);
    // A tiny handheld frame (e.g. NW-A306 portrait) stays legible, not blown up.
    expect(computeCardSize(179, 319)).toBeCloseTo(64, 5);
  });

  it("sizes the portrait card to nearly fill the container width", () => {
    // A portrait handheld: the album nearly fills the width (much bigger than
    // the landscape fan card for the same frame).
    expect(computeCardSize(179, 319, "y")).toBeCloseTo(150.36, 2);
    expect(computeCardSize(179, 319, "y")).toBeGreaterThan(
      computeCardSize(179, 319, "x"),
    );
    // Clamped so a wide portrait window doesn't produce an absurd cover.
    expect(computeCardSize(700, 1200, "y")).toBe(420);
  });

  it("derives detail size from the smaller container projection", () => {
    expect(computeDetailSize(1000, 1000)).toBe(550);
    expect(computeDetailSize(2000, 400)).toBe(300);
  });

  it("produces a deterministic resting rotation per index", () => {
    expect(seededRotation(3)).toBe(seededRotation(3));
    expect(Math.abs(seededRotation(3))).toBeLessThanOrEqual(7);
  });

  it("lifts, straightens, and raises the active card", () => {
    const active = cardStyle({
      index: 2,
      activeIndex: 2,
      cardSize: 200,
      cardSpacing: 190,
      rotation: 5,
    });
    expect(active.opacity).toBe(1);
    expect(active.zIndex).toBe(120);
    expect(active.transform).toContain("rotate(0deg)");
    expect(active.transform).toContain("scale(1.08)");
  });

  it("offsets and dims non-active cards by their distance", () => {
    const neighbor = cardStyle({
      index: 3,
      activeIndex: 2,
      cardSize: 200,
      cardSpacing: 190,
      rotation: 5,
    });
    expect(neighbor.opacity).toBe(0.55);
    expect(neighbor.zIndex).toBe(90);
    expect(neighbor.transform).toContain("translateX(190px)");
    expect(neighbor.transform).toContain("rotate(5deg)");
  });

  it("reflows the offset onto the Y axis in a portrait container", () => {
    const neighbor = cardStyle({
      index: 3,
      activeIndex: 2,
      cardSize: 200,
      cardSpacing: 190,
      rotation: 5,
      axis: "y",
    });
    expect(neighbor.transform).toContain("translateY(190px)");
    expect(neighbor.marginTop).toBe(-100);
    // Portrait covers stay centered and upright: no sideways nudge, no tilt.
    expect(neighbor.transform).not.toContain("translateX");
    expect(neighbor.transform).toContain("rotate(0deg)");
  });

  it("chooses the flow axis from the container aspect ratio", () => {
    expect(coverflowAxis(1000, 600)).toBe("x");
    expect(coverflowAxis(600, 1000)).toBe("y");
    expect(coverflowAxis(500, 500)).toBe("x");
  });

  it("steps the active index from a drag delta and clamps to bounds", () => {
    // No movement keeps the starting card.
    expect(stepIndexFromDelta(2, 0, 100, 7)).toBe(2);
    // Dragging up/left (negative) advances toward later cards.
    expect(stepIndexFromDelta(2, -200, 100, 7)).toBe(4);
    // Dragging down/right (positive) goes back toward earlier cards.
    expect(stepIndexFromDelta(4, 200, 100, 7)).toBe(2);
    // Clamped at both ends.
    expect(stepIndexFromDelta(0, 1000, 50, 7)).toBe(0);
    expect(stepIndexFromDelta(6, -1000, 50, 7)).toBe(6);
    // Degenerate spacing is a no-op, not a crash.
    expect(stepIndexFromDelta(3, 120, 0, 7)).toBe(3);
  });
});
