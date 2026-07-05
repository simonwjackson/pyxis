import { CoverflowStage } from "@app/features/sandbox/QueueCoverflow/components/CoverflowStage";
import { QUEUE_COVERFLOW_PREVIEW_TRACKS } from "@app/features/sandbox/QueueCoverflow/QueueCoverflowFixtures";
import { PartStage } from "./PartStage";

export const name = "Coverflow Stage";
export const note = "The tilted cover-flow row of cards around the active one.";

export default function CoverflowStagePart() {
  return (
    <PartStage width={360} height={260} contain>
      <CoverflowStage
        tracks={QUEUE_COVERFLOW_PREVIEW_TRACKS}
        activeIndex={2}
        cardSize={130}
        focusable={false}
      />
    </PartStage>
  );
}
