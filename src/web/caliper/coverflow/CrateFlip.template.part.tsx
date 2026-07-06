import { QUEUE_COVERFLOW_PREVIEW_TRACKS } from "@app/features/sandbox/QueueCoverflow/QueueCoverflowFixtures";
import { QueueCrate } from "@app/features/sandbox/QueueCoverflow/QueueCrate";
import { PartStage } from "./PartStage";

export const name = "Crate — Flip";
export const note =
  "Flip through leaning sleeves in a crate; active one stands upright and forward.";

export default function CrateFlipTemplate() {
  return (
    <PartStage width="100%" height="100%" contain>
      <QueueCrate tracks={QUEUE_COVERFLOW_PREVIEW_TRACKS} variant="flip" />
    </PartStage>
  );
}
