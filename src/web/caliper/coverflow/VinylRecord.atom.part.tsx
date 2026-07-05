import { VinylRecord } from "@app/features/sandbox/QueueCoverflow/components/VinylRecord";
import { QUEUE_COVERFLOW_PREVIEW_TRACKS } from "@app/features/sandbox/QueueCoverflow/QueueCoverflowFixtures";
import { PartStage } from "./PartStage";

export const name = "Vinyl Record";
export const note =
  "Spinning record behind the album cover in the detail view.";

const track = QUEUE_COVERFLOW_PREVIEW_TRACKS[0];

export default function VinylRecordPart() {
  return (
    <PartStage>
      <VinylRecord
        size={200}
        color={track?.dominantColor ?? "#666"}
        title={track?.title ?? "Seaside Drive"}
        artist={track?.artist ?? "Luna Mars"}
        spinning
      />
    </PartStage>
  );
}
