import { QueueCoverflowDeck } from "@app/features/sandbox/QueueCoverflow/QueueCoverflowDeck";
import { QUEUE_COVERFLOW_PREVIEW_TRACKS } from "@app/features/sandbox/QueueCoverflow/QueueCoverflowFixtures";
import { PartStage } from "./PartStage";

export const name = "Deck — Fanned";
export const note =
  "Stacked albums fan with a slight rotation each, like a spread hand of cards.";

export default function DeckFannedTemplate() {
  return (
    <PartStage width="100%" height="100%" contain>
      <QueueCoverflowDeck
        tracks={QUEUE_COVERFLOW_PREVIEW_TRACKS}
        initialIndex={3}
        tuning={{
          gap: 0.14,
          lip: 0.11,
          stackScale: 0.97,
          rotationStep: 3,
          maxPerSide: 6,
        }}
      />
    </PartStage>
  );
}
