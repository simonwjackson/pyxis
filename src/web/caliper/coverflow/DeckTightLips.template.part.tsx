import { QueueCoverflowDeck } from "@app/features/sandbox/QueueCoverflow/QueueCoverflowDeck";
import { QUEUE_COVERFLOW_PREVIEW_TRACKS } from "@app/features/sandbox/QueueCoverflow/QueueCoverflowFixtures";
import { PartStage } from "./PartStage";

export const name = "Deck — Tight Lips";
export const note =
  "Wider padding around the selected; very thin lips so many albums stack up.";

export default function DeckTightLipsTemplate() {
  return (
    <PartStage width="100%" height="100%" contain>
      <QueueCoverflowDeck
        tracks={QUEUE_COVERFLOW_PREVIEW_TRACKS}
        initialIndex={3}
        tuning={{
          gap: 0.18,
          lip: 0.05,
          stackScale: 1,
          rotationStep: 0,
          maxPerSide: 8,
        }}
      />
    </PartStage>
  );
}
