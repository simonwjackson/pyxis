import { QUEUE_COVERFLOW_PREVIEW_TRACKS } from "@app/features/sandbox/QueueCoverflow/QueueCoverflowFixtures";
import { QueueCoverflowReady } from "@app/features/sandbox/QueueCoverflow/QueueCoverflowReady";
import { PartStage } from "./PartStage";

export const name = "Queue Coverflow";
export const note = "The full composed cover-flow surface with a ready queue.";
export const surface = true;

export default function QueueCoverflowPagePart() {
  return (
    <PartStage width="100%" height="100%" contain padding={0}>
      <QueueCoverflowReady
        tracks={QUEUE_COVERFLOW_PREVIEW_TRACKS}
        initialIndex={2}
      />
    </PartStage>
  );
}
