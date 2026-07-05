import { describe, expect, it } from "bun:test";
import {
  cardStyle,
  computeCardSize,
  computeDetailSize,
  coverflowAxis,
  seededRotation,
} from "./queueCoverflowGeometry.js";

describe("queueCoverflowGeometry", () => {
  it("sizes the card from the container's smaller side, clamped 64..300", () => {
    expect(computeCardSize(120, 120)).toBe(64);
    expect(computeCardSize(4000, 4000)).toBe(300);
    expect(computeCardSize(1000, 800)).toBeCloseTo(272, 5);
    // A tiny handheld frame (e.g. NW-A306 portrait) stays legible, not blown up.
    expect(computeCardSize(179, 319)).toBeCloseTo(64, 5);
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
  });

  it("chooses the flow axis from the container aspect ratio", () => {
    expect(coverflowAxis(1000, 600)).toBe("x");
    expect(coverflowAxis(600, 1000)).toBe("y");
    expect(coverflowAxis(500, 500)).toBe("x");
  });
});
