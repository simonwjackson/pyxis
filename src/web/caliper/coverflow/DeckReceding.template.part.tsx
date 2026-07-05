import { QueueCoverflowDeck } from "@app/features/sandbox/QueueCoverflow/QueueCoverflowDeck";
import { QUEUE_COVERFLOW_PREVIEW_TRACKS } from "@app/features/sandbox/QueueCoverflow/QueueCoverflowFixtures";
import { PartStage } from "./PartStage";

export const name = "Deck — Receding";
export const note =
  "Stacked albums shrink as they recede, for depth; padding around the selected.";

export default function DeckRecedingTemplate() {
  return (
    <PartStage width="100%" height="100%" contain>
      <QueueCoverflowDeck
        tracks={QUEUE_COVERFLOW_PREVIEW_TRACKS}
        initialIndex={3}
        tuning={{
          gap: 0.16,
          lip: 0.07,
          stackScale: 0.93,
          rotationStep: 0,
          maxPerSide: 7,
        }}
      />
    </PartStage>
  );
}
