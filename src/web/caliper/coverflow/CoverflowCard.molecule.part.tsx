import { CoverflowCard } from "@app/features/sandbox/QueueCoverflow/components/CoverflowCard";
import { QUEUE_COVERFLOW_PREVIEW_TRACKS } from "@app/features/sandbox/QueueCoverflow/QueueCoverflowFixtures";
import { PartStage } from "./PartStage";

export const name = "Coverflow Card";
export const note = "One album tile: artwork with layered shadows + label.";

const track = QUEUE_COVERFLOW_PREVIEW_TRACKS[0];
const other = QUEUE_COVERFLOW_PREVIEW_TRACKS[1] ?? track;

export default function CoverflowCardPart() {
  return (
    <PartStage>
      <div style={{ width: 200 }}>
        {track ? <CoverflowCard track={track} size={200} active /> : null}
      </div>
    </PartStage>
  );
}

export function Inactive() {
  return (
    <PartStage>
      <div style={{ width: 200, opacity: 0.55 }}>
        {other ? (
          <CoverflowCard track={other} size={200} active={false} />
        ) : null}
      </div>
    </PartStage>
  );
}
