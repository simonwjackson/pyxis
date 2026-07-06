import { QUEUE_COVERFLOW_PREVIEW_TRACKS } from "@app/features/sandbox/QueueCoverflow/QueueCoverflowFixtures";
import { QueueCrate } from "@app/features/sandbox/QueueCoverflow/QueueCrate";
import { PartStage } from "./PartStage";

export const name = "Crate — Spine";
export const note =
  "Browse spines on a shelf: printed title, colour band, disc edge peeking out.";

export default function CrateSpineTemplate() {
  return (
    <PartStage width="100%" height="100%" contain>
      <QueueCrate tracks={QUEUE_COVERFLOW_PREVIEW_TRACKS} variant="spine" />
    </PartStage>
  );
}
