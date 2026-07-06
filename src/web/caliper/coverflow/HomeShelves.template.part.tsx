import { QueueHome } from "@app/features/sandbox/QueueCoverflow/QueueHome";
import { PartStage } from "./PartStage";

export const name = "Home — Shelves";
export const note = "Home surface, shelves variation, in the coverflow theme.";

export default function HomeShelvesTemplate() {
  return (
    <PartStage width="100%" height="100%" contain>
      <QueueHome variant="shelves" />
    </PartStage>
  );
}
