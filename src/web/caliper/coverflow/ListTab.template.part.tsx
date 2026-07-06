import { QUEUE_COVERFLOW_PREVIEW_TRACKS } from "@app/features/sandbox/QueueCoverflow/QueueCoverflowFixtures";
import { QueueList } from "@app/features/sandbox/QueueCoverflow/QueueList";
import { PartStage } from "./PartStage";

export const name = "List — Tab";
export const note =
  "Pocketed cover with the name and a record-divider index tab.";

export default function ListTabTemplate() {
  return (
    <PartStage width="100%" height="100%" contain>
      <QueueList tracks={QUEUE_COVERFLOW_PREVIEW_TRACKS} variant="tab" />
    </PartStage>
  );
}
