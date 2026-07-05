import { Tonearm } from "@app/features/sandbox/QueueCoverflow/components/Tonearm";
import { PartStage } from "./PartStage";

export const name = "Tonearm";
export const note = "Turntable arm that swings onto the record when engaged.";

export default function TonearmPart() {
  return (
    <PartStage>
      <div style={{ position: "relative", width: 200, height: 200 }}>
        <Tonearm size={200} engaged />
      </div>
    </PartStage>
  );
}

export function Disengaged() {
  return (
    <PartStage>
      <div style={{ position: "relative", width: 200, height: 200 }}>
        <Tonearm size={200} engaged={false} />
      </div>
    </PartStage>
  );
}
