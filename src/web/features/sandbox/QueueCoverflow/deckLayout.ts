/**
 * @module deckLayout
 *
 * A "pulled card" layout, distinct from the cover-flow: the selected album sits
 * in the centre with real empty padding above and below (no overlap), and the
 * rest stack like a staggered deck — each non-selected card offset by a small
 * lip so only a sliver shows, fanning up above the selected and down below it.
 *
 * Pure and side-effect free so it can be unit tested without a DOM.
 */

export interface DeckLayoutParams {
  readonly activeIndex: number;
  readonly count: number;
  readonly cardSize: number;
  /** Empty gap between the selected card's edge and the first stacked card. */
  readonly gap: number;
  /** Exposed lip per stacked card (how much of each stacked album shows). */
  readonly lip: number;
  /** Per-card shrink for the stack (1 = same size, <1 recedes). */
  readonly stackScale: number;
  /** Per-card rotation for a fanned stagger, in degrees. */
  readonly rotationStep: number;
  /** Max cards to place on each side of the selected. */
  readonly maxPerSide: number;
}

export interface DeckItem {
  readonly index: number;
  /** Card-centre offset from the container centre along the vertical axis. */
  readonly y: number;
  readonly scale: number;
  readonly zIndex: number;
  readonly rotation: number;
}

export function deckLayout(params: DeckLayoutParams): readonly DeckItem[] {
  const { activeIndex, count, cardSize, gap, lip, stackScale, rotationStep } =
    params;
  const half = cardSize / 2;
  const maxPerSide = Math.max(0, Math.floor(params.maxPerSide));

  const items: DeckItem[] = [
    { index: activeIndex, y: 0, scale: 1, zIndex: 100000, rotation: 0 },
  ];

  for (let k = 1; k <= maxPerSide; k += 1) {
    const scale = stackScale ** k;
    const stackHalf = (cardSize * scale) / 2;
    // Nearer cards sit in front (higher z); far ones recede behind.
    const zIndex = 1000 + (maxPerSide - k);

    const below = activeIndex + k;
    if (below < count) {
      const topEdge = half + gap + (k - 1) * lip;
      items.push({
        index: below,
        y: topEdge + stackHalf,
        scale,
        zIndex,
        rotation: rotationStep * k,
      });
    }

    const above = activeIndex - k;
    if (above >= 0) {
      const bottomEdge = -(half + gap) - (k - 1) * lip;
      items.push({
        index: above,
        y: bottomEdge - stackHalf,
        scale,
        zIndex,
        rotation: -rotationStep * k,
      });
    }
  }

  return items;
}
