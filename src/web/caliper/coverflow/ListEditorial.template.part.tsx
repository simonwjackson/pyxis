import { QUEUE_COVERFLOW_PREVIEW_TRACKS } from "@app/features/sandbox/QueueCoverflow/QueueCoverflowFixtures";
import { QueueList } from "@app/features/sandbox/QueueCoverflow/QueueList";
import { PartStage } from "./PartStage";

export const name = "List — Editorial";
export const note =
  "Pocketed thumbnail with a big lowercase title and artist kicker; thin rules.";

export default function ListEditorialTemplate() {
  return (
    <PartStage width="100%" height="100%" contain>
      <QueueList tracks={QUEUE_COVERFLOW_PREVIEW_TRACKS} variant="editorial" />
    </PartStage>
  );
}
