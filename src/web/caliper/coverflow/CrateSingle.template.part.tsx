import { QUEUE_COVERFLOW_PREVIEW_TRACKS } from "@app/features/sandbox/QueueCoverflow/QueueCoverflowFixtures";
import { QueueCrate } from "@app/features/sandbox/QueueCoverflow/QueueCrate";
import { PartStage } from "./PartStage";

export const name = "Crate — 45";
export const note =
  "7-inch single: art as the record label on a grooved disc in a paper sleeve.";

export default function CrateSingleTemplate() {
  return (
    <PartStage width="100%" height="100%" contain>
      <QueueCrate tracks={QUEUE_COVERFLOW_PREVIEW_TRACKS} variant="single" />
    </PartStage>
  );
}
