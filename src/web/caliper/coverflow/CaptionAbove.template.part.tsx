import { QUEUE_COVERFLOW_PREVIEW_TRACKS } from "@app/features/sandbox/QueueCoverflow/QueueCoverflowFixtures";
import { QueueCoverflowReady } from "@app/features/sandbox/QueueCoverflow/QueueCoverflowReady";
import { PartStage } from "./PartStage";

export const name = "Caption Above";
export const note =
  "Covers stand alone; the title/artist caption sits above the stack as a header.";

export default function CaptionAboveTemplate() {
  return (
    <PartStage width="100%" height="100%" contain>
      <QueueCoverflowReady
        tracks={QUEUE_COVERFLOW_PREVIEW_TRACKS}
        initialIndex={2}
        captionVariant="above"
      />
    </PartStage>
  );
}
