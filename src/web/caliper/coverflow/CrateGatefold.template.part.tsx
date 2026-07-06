import { QUEUE_COVERFLOW_PREVIEW_TRACKS } from "@app/features/sandbox/QueueCoverflow/QueueCoverflowFixtures";
import { QueueCrate } from "@app/features/sandbox/QueueCoverflow/QueueCrate";
import { PartStage } from "./PartStage";

export const name = "Crate — Gatefold";
export const note =
  "Opened gatefold: art panel, fold seam, cream liner-notes panel with the title.";

export default function CrateGatefoldTemplate() {
  return (
    <PartStage width="100%" height="100%" contain>
      <QueueCrate tracks={QUEUE_COVERFLOW_PREVIEW_TRACKS} variant="gatefold" />
    </PartStage>
  );
}
