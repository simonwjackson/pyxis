import { describe, expect, it } from "bun:test";
import { deckLayout } from "./deckLayout.js";

const base = {
  activeIndex: 3,
  count: 8,
  cardSize: 120,
  gap: 16,
  lip: 12,
  stackScale: 1,
  rotationStep: 0,
  maxPerSide: 6,
};

describe("deckLayout", () => {
  it("centres the selected album on top with no offset", () => {
    const items = deckLayout(base);
    const active = items.find((i) => i.index === 3);
    expect(active).toBeDefined();
    expect(active?.y).toBe(0);
    expect(active?.scale).toBe(1);
    // Selected outranks every stacked card.
    const maxStackZ = Math.max(
      ...items.filter((i) => i.index !== 3).map((i) => i.zIndex),
    );
    expect(active?.zIndex).toBeGreaterThan(maxStackZ);
  });

  it("leaves an empty gap between the selected and the first stacked card", () => {
    const items = deckLayout(base);
    const below = items.find((i) => i.index === 4);
    // First below card's top edge sits a full gap past the selected's edge.
    const topEdge = (below?.y ?? 0) - base.cardSize / 2;
    expect(topEdge).toBeCloseTo(base.cardSize / 2 + base.gap, 5);
  });

  it("stacks above and below, staggered by the lip", () => {
    const items = deckLayout(base);
    const below1 = items.find((i) => i.index === 4);
    const below2 = items.find((i) => i.index === 5);
    const above1 = items.find((i) => i.index === 2);
    // Below cards go positive (down), above go negative (up).
    expect(below1?.y ?? 0).toBeGreaterThan(0);
    expect(above1?.y ?? 0).toBeLessThan(0);
    // Consecutive stacked cards are offset by exactly the lip.
    expect((below2?.y ?? 0) - (below1?.y ?? 0)).toBeCloseTo(base.lip, 5);
    // Nearer cards sit in front of farther ones.
    expect(below1?.zIndex ?? 0).toBeGreaterThan(below2?.zIndex ?? 0);
  });

  it("clamps to the available albums at the ends of the queue", () => {
    const atStart = deckLayout({ ...base, activeIndex: 0 });
    // No cards above index 0.
    expect(atStart.every((i) => i.index >= 0)).toBe(true);
    const atEnd = deckLayout({ ...base, activeIndex: 7 });
    expect(atEnd.every((i) => i.index < base.count)).toBe(true);
  });
});
