import { QueueHome } from "@app/features/sandbox/QueueCoverflow/QueueHome";
import { PartStage } from "./PartStage";

export const name = "Home — Editorial";
export const note =
  "Home surface, editorial variation, in the coverflow theme.";

export default function HomeEditorialTemplate() {
  return (
    <PartStage width="100%" height="100%" contain>
      <QueueHome variant="editorial" />
    </PartStage>
  );
}
