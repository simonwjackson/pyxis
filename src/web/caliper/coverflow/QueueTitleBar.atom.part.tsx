import { QueueTitleBar } from "@app/features/sandbox/QueueCoverflow/components/QueueTitleBar";
import { PartStage } from "./PartStage";

export const name = "Queue Title Bar";
export const note =
  "Floating title pill; fades out when the detail view opens.";

export default function QueueTitleBarPart() {
  return (
    <PartStage contain width={300} height={90}>
      <QueueTitleBar visible />
    </PartStage>
  );
}
