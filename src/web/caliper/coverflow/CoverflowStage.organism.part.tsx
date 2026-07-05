import { CoverflowStage } from "@app/features/sandbox/QueueCoverflow/components/CoverflowStage";
import { QUEUE_COVERFLOW_PREVIEW_TRACKS } from "@app/features/sandbox/QueueCoverflow/QueueCoverflowFixtures";
import { PartStage } from "./PartStage";

export const name = "Coverflow Stage";
export const note =
  "The cover-flow row of cards around the active one; reflows by container aspect.";

export default function CoverflowStagePart() {
  return (
    <PartStage width={360} height={260} contain>
      <CoverflowStage
        tracks={QUEUE_COVERFLOW_PREVIEW_TRACKS}
        activeIndex={2}
        cardSize={130}
        axis="x"
        focusable={false}
      />
    </PartStage>
  );
}

export function Vertical() {
  return (
    <PartStage width={240} height={360} contain>
      <CoverflowStage
        tracks={QUEUE_COVERFLOW_PREVIEW_TRACKS}
        activeIndex={2}
        cardSize={120}
        axis="y"
        focusable={false}
      />
    </PartStage>
  );
}
