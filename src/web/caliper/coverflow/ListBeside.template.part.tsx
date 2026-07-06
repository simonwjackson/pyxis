import { QUEUE_COVERFLOW_PREVIEW_TRACKS } from "@app/features/sandbox/QueueCoverflow/QueueCoverflowFixtures";
import { QueueList } from "@app/features/sandbox/QueueCoverflow/QueueList";
import { PartStage } from "./PartStage";

export const name = "List — Beside";
export const note =
  "Cover tucked in a pocket on the left; name beside it past a seam line.";

export default function ListBesideTemplate() {
  return (
    <PartStage width="100%" height="100%" contain>
      <QueueList tracks={QUEUE_COVERFLOW_PREVIEW_TRACKS} variant="beside" />
    </PartStage>
  );
}
