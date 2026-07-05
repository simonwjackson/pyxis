import { CoverflowDetail } from "@app/features/sandbox/QueueCoverflow/components/CoverflowDetail";
import { QUEUE_COVERFLOW_PREVIEW_TRACKS } from "@app/features/sandbox/QueueCoverflow/QueueCoverflowFixtures";
import { PartStage } from "./PartStage";

export const name = "Coverflow Detail";
export const note =
  "Album cover with the vinyl + tonearm sliding out behind it.";

const track = QUEUE_COVERFLOW_PREVIEW_TRACKS[2];

export default function CoverflowDetailPart() {
  return (
    <PartStage width={360} height={320} contain>
      <CoverflowDetail track={track} detailSize={200} open />
    </PartStage>
  );
}
