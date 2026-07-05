import { QueueCoverflowDeck } from "@app/features/sandbox/QueueCoverflow/QueueCoverflowDeck";
import { QUEUE_COVERFLOW_PREVIEW_TRACKS } from "@app/features/sandbox/QueueCoverflow/QueueCoverflowFixtures";
import { PartStage } from "./PartStage";

export const name = "Deck — Dense Stagger";
export const note =
  "A tighter padding with a gentle fan and slight shrink; a denser browsable stack.";

export default function DeckDenseStaggerTemplate() {
  return (
    <PartStage width="100%" height="100%" contain>
      <QueueCoverflowDeck
        tracks={QUEUE_COVERFLOW_PREVIEW_TRACKS}
        initialIndex={3}
        tuning={{
          gap: 0.1,
          lip: 0.06,
          stackScale: 0.96,
          rotationStep: 1.5,
          maxPerSide: 8,
        }}
      />
    </PartStage>
  );
}
