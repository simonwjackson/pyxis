import { BlurredBackdrop } from "@app/features/sandbox/QueueCoverflow/components/BlurredBackdrop";
import { QUEUE_COVERFLOW_PREVIEW_TRACKS } from "@app/features/sandbox/QueueCoverflow/QueueCoverflowFixtures";
import { PartStage } from "./PartStage";

export const name = "Blurred Backdrop";
export const note = "Blurred, saturated album art behind the whole surface.";

const track = QUEUE_COVERFLOW_PREVIEW_TRACKS[0];

export default function BlurredBackdropPart() {
  return (
    <PartStage contain padding={0}>
      <BlurredBackdrop artwork={track?.artwork ?? ""} />
    </PartStage>
  );
}
