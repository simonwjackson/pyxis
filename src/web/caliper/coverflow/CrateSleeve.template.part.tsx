import { QUEUE_COVERFLOW_PREVIEW_TRACKS } from "@app/features/sandbox/QueueCoverflow/QueueCoverflowFixtures";
import { QueueCrate } from "@app/features/sandbox/QueueCoverflow/QueueCrate";
import { PartStage } from "./PartStage";

export const name = "Crate — Sleeve";
export const note =
  "Cardboard sleeve, art printed on the front, vinyl slides out; cream label below.";

export default function CrateSleeveTemplate() {
  return (
    <PartStage width="100%" height="100%" contain>
      <QueueCrate tracks={QUEUE_COVERFLOW_PREVIEW_TRACKS} variant="sleeve" />
    </PartStage>
  );
}
