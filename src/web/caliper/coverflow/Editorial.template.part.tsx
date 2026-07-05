import { QUEUE_COVERFLOW_PREVIEW_TRACKS } from "@app/features/sandbox/QueueCoverflow/QueueCoverflowFixtures";
import { QueueCoverflowReady } from "@app/features/sandbox/QueueCoverflow/QueueCoverflowReady";
import { PartStage } from "./PartStage";

export const name = "Editorial Footer";
export const note =
  "Covers stand alone; a big lowercase title with artist + track counter below.";

export default function EditorialTemplate() {
  return (
    <PartStage width="100%" height="100%" contain>
      <QueueCoverflowReady
        tracks={QUEUE_COVERFLOW_PREVIEW_TRACKS}
        initialIndex={2}
        captionVariant="editorial"
      />
    </PartStage>
  );
}
