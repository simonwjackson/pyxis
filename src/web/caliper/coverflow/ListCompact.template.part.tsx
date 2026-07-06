import { QUEUE_COVERFLOW_PREVIEW_TRACKS } from "@app/features/sandbox/QueueCoverflow/QueueCoverflowFixtures";
import { QueueList } from "@app/features/sandbox/QueueCoverflow/QueueList";
import { PartStage } from "./PartStage";

export const name = "List — Compact";
export const note = "Small cover, title/artist, index; tight clean rows.";

export default function ListCompactTemplate() {
  return (
    <PartStage width="100%" height="100%" contain>
      <QueueList tracks={QUEUE_COVERFLOW_PREVIEW_TRACKS} variant="compact" />
    </PartStage>
  );
}
