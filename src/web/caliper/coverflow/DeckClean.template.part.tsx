import { QueueCoverflowDeck } from "@app/features/sandbox/QueueCoverflow/QueueCoverflowDeck";
import { QUEUE_COVERFLOW_PREVIEW_TRACKS } from "@app/features/sandbox/QueueCoverflow/QueueCoverflowFixtures";
import { PartStage } from "./PartStage";

export const name = "Deck — Clean";
export const note =
  "Selected pulled out with padding above/below; even lip-stacks, same size.";

export default function DeckCleanTemplate() {
  return (
    <PartStage width="100%" height="100%" contain>
      <QueueCoverflowDeck
        tracks={QUEUE_COVERFLOW_PREVIEW_TRACKS}
        initialIndex={3}
        tuning={{
          gap: 0.14,
          lip: 0.1,
          stackScale: 1,
          rotationStep: 0,
          maxPerSide: 6,
        }}
      />
    </PartStage>
  );
}
