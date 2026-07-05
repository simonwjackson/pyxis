/**
 * @module CoverflowStage
 *
 * The tilted cover-flow row: each track is absolutely positioned relative to
 * the active one via the pure geometry, wrapping a {@link CoverflowCard}. Owns
 * layout + per-card selection; not data fetching.
 */

import { useMemo } from "react";
import type { QueueCoverflowTrack } from "../QueueCoverflowState";
import {
  type CoverflowAxis,
  cardSpacingFor,
  cardStyle,
  seededRotation,
} from "../queueCoverflowGeometry";
import { CoverflowCard } from "./CoverflowCard";

export function CoverflowStage({
  tracks,
  activeIndex,
  cardSize,
  axis = "x",
  focusable = true,
  onSelect,
}: {
  readonly tracks: readonly QueueCoverflowTrack[];
  readonly activeIndex: number;
  readonly cardSize: number;
  readonly axis?: CoverflowAxis;
  readonly focusable?: boolean;
  readonly onSelect?: (index: number) => void;
}) {
  const cardSpacing = cardSpacingFor(cardSize, axis);
  const rotations = useMemo(
    () => tracks.map((_, i) => seededRotation(i)),
    [tracks],
  );

  return (
    <>
      {tracks.map((track, index) => (
        // biome-ignore lint/a11y/useSemanticElements: cards are absolute-positioned rich media tiles; native button layout would distort the surface.
        <div
          key={track.id}
          role="button"
          tabIndex={focusable ? 0 : -1}
          style={cardStyle({
            index,
            activeIndex,
            cardSize,
            cardSpacing,
            rotation: rotations[index] ?? 0,
            axis,
          })}
          onClick={() => onSelect?.(index)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect?.(index);
            }
          }}
        >
          <CoverflowCard
            track={track}
            size={cardSize}
            active={index === activeIndex}
          />
        </div>
      ))}
    </>
  );
}
