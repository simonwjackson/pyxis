import { describe, expect, it } from "bun:test";
import {
  cardStyle,
  computeDetailSize,
  computeViewportCardSize,
  seededRotation,
} from "./queueCoverflowGeometry.js";

describe("queueCoverflowGeometry", () => {
  it("clamps the viewport card size between 120 and 360", () => {
    expect(computeViewportCardSize(200, 200)).toBe(120);
    expect(computeViewportCardSize(4000, 4000)).toBe(360);
    expect(computeViewportCardSize(1000, 800)).toBeCloseTo(256, 5);
  });

  it("derives detail size from the smaller viewport projection", () => {
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
});
