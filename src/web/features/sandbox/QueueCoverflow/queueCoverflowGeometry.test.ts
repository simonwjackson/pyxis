import { describe, expect, it } from "bun:test";
import {
  cardMainOffset,
  cardStyle,
  computeCardSize,
  computeDetailSize,
  coverflowAxis,
  PORTRAIT_TILT,
  seededRotation,
  stepIndexFromDelta,
} from "./queueCoverflowGeometry.js";

function translateAxis(transform: unknown, axis: "X" | "Y"): number {
  const match = new RegExp(`translate${axis}\\(([-\\d.]+)px\\)`).exec(
    String(transform),
  );
  return Number(match?.[1] ?? "0");
}

describe("queueCoverflowGeometry", () => {
  it("sizes the landscape card from the container's smaller side, clamped 64..300", () => {
    expect(computeCardSize(120, 120)).toBe(64);
    expect(computeCardSize(4000, 4000)).toBe(300);
    expect(computeCardSize(1000, 800)).toBeCloseTo(272, 5);
    // A tiny handheld frame (e.g. NW-A306 portrait) stays legible, not blown up.
    expect(computeCardSize(179, 319)).toBeCloseTo(64, 5);
  });

  it("sizes the portrait card to nearly fill the container width", () => {
    expect(computeCardSize(179, 319, "y")).toBeCloseTo(150.36, 2);
    expect(computeCardSize(179, 319, "y")).toBeGreaterThan(
      computeCardSize(179, 319, "x"),
    );
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
      rotation: 5,
    });
    expect(active.opacity).toBe(1);
    expect(active.zIndex).toBe(120);
    expect(active.transform).toContain("rotate(0deg)");
    expect(active.transform).toContain("scale(1.08)");
  });

  it("offsets and dims non-active cards by their distance (landscape fan)", () => {
    const neighbor = cardStyle({
      index: 3,
      activeIndex: 2,
      cardSize: 200,
      rotation: 5,
    });
    expect(neighbor.opacity).toBe(0.55);
    expect(neighbor.zIndex).toBe(100);
    // Landscape uses a uniform fan: 0.9 * 200.
    expect(translateAxis(neighbor.transform, "X")).toBeCloseTo(180, 5);
    expect(neighbor.transform).toContain("rotate(5deg)");
  });

  it("reflows the offset onto the Y axis in a portrait container", () => {
    const neighbor = cardStyle({
      index: 3,
      activeIndex: 2,
      cardSize: 200,
      rotation: 5,
      axis: "y",
    });
    // Portrait first neighbour uses the (larger) centre spacing, not compressed.
    expect(translateAxis(neighbor.transform, "Y")).toBeCloseTo(87.31, 1);
    expect(neighbor.marginTop).toBe(-100);
    expect(neighbor.transform).not.toContain("translateX");
    expect(neighbor.transform).toContain(`rotate(${5 * PORTRAIT_TILT}deg)`);
  });

  it("compresses far portrait cards into a record-bin stack", () => {
    const o1 = cardMainOffset(1, 200, "y");
    const o2 = cardMainOffset(2, 200, "y");
    const o5 = cardMainOffset(5, 200, "y");
    const o6 = cardMainOffset(6, 200, "y");
    // The active album stands on its own: the first gap is the widest.
    expect(o2 - o1).toBeLessThan(o1);
    // Far gaps compress toward the tight pack, so more cards are visible.
    expect(o6 - o5).toBeLessThan(o2 - o1);
    expect(o6 - o5).toBeCloseTo(0.17 * 200, 0);
    // Landscape stays a uniform fan (no compression).
    expect(
      cardMainOffset(2, 200, "x") - cardMainOffset(1, 200, "x"),
    ).toBeCloseTo(cardMainOffset(1, 200, "x"), 5);
  });

  it("chooses the flow axis from the container aspect ratio", () => {
    expect(coverflowAxis(1000, 600)).toBe("x");
    expect(coverflowAxis(600, 1000)).toBe("y");
    expect(coverflowAxis(500, 500)).toBe("x");
  });

  it("reselects live via a fractional active index with transitions off", () => {
    const base = cardStyle({
      index: 3,
      activeIndex: 2,
      cardSize: 200,
      rotation: 5,
    });
    const dragged = cardStyle({
      index: 3,
      activeIndex: 2.7,
      cardSize: 200,
      rotation: 5,
      dragging: true,
    });
    expect(translateAxis(base.transform, "X")).toBeCloseTo(180, 5);
    expect(base.transform).toContain("scale(1)");
    expect(dragged.transition).toBe("none");
    // 0.3 card from centre in the landscape fan: 0.3 * 180 = 54px.
    expect(translateAxis(dragged.transform, "X")).toBeCloseTo(54, 1);
    const scale = Number(
      /scale\(([\d.]+)\)/.exec(String(dragged.transform))?.[1] ?? "0",
    );
    expect(scale).toBeGreaterThan(1);
    expect(scale).toBeLessThan(1.08);
  });

  it("steps the active index from a drag delta and clamps to bounds", () => {
    expect(stepIndexFromDelta(2, 0, 100, 7)).toBe(2);
    expect(stepIndexFromDelta(2, -200, 100, 7)).toBe(4);
    expect(stepIndexFromDelta(4, 200, 100, 7)).toBe(2);
    expect(stepIndexFromDelta(0, 1000, 50, 7)).toBe(0);
    expect(stepIndexFromDelta(6, -1000, 50, 7)).toBe(6);
    expect(stepIndexFromDelta(3, 120, 0, 7)).toBe(3);
  });
});
