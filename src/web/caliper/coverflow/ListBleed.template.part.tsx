import { QUEUE_COVERFLOW_PREVIEW_TRACKS } from "@app/features/sandbox/QueueCoverflow/QueueCoverflowFixtures";
import { QueueList } from "@app/features/sandbox/QueueCoverflow/QueueList";
import { PartStage } from "./PartStage";

export const name = "List — Bleed";
export const note =
  "Full-width cover with editorial caption below, magazine-style.";

export default function ListBleedTemplate() {
  return (
    <PartStage width="100%" height="100%" contain>
      <QueueList tracks={QUEUE_COVERFLOW_PREVIEW_TRACKS} variant="bleed" />
    </PartStage>
  );
}
