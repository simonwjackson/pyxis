import { QUEUE_COVERFLOW_PREVIEW_TRACKS } from "@app/features/sandbox/QueueCoverflow/QueueCoverflowFixtures";
import { QueueCoverflowReady } from "@app/features/sandbox/QueueCoverflow/QueueCoverflowReady";
import { PartStage } from "./PartStage";

export const name = "Caption Below";
export const note =
  "Covers stand alone; a centered title/artist caption sits under the stack.";

export default function CaptionBelowTemplate() {
  return (
    <PartStage width="100%" height="100%" contain>
      <QueueCoverflowReady
        tracks={QUEUE_COVERFLOW_PREVIEW_TRACKS}
        initialIndex={2}
        captionVariant="below"
      />
    </PartStage>
  );
}
