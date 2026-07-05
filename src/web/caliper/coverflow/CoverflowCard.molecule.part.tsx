import { CoverflowCard } from "@app/features/sandbox/QueueCoverflow/components/CoverflowCard";
import { QUEUE_COVERFLOW_PREVIEW_TRACKS } from "@app/features/sandbox/QueueCoverflow/QueueCoverflowFixtures";
import { PartStage } from "./PartStage";

export const name = "Coverflow Card";
export const note =
  "One album cover: artwork only, with a deeper active shadow.";

const track = QUEUE_COVERFLOW_PREVIEW_TRACKS[0];
const other = QUEUE_COVERFLOW_PREVIEW_TRACKS[1] ?? track;

export default function CoverflowCardPart() {
  return (
    <PartStage>
      <div style={{ width: 200 }}>
        {track ? <CoverflowCard track={track} active /> : null}
      </div>
    </PartStage>
  );
}

export function Inactive() {
  return (
    <PartStage>
      <div style={{ width: 200 }}>
        {other ? <CoverflowCard track={other} active={false} /> : null}
      </div>
    </PartStage>
  );
}
