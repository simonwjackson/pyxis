import { QueueSearch } from "@app/features/sandbox/QueueCoverflow/QueueSearch";
import { PartStage } from "./PartStage";

export const name = "Search — Idle";
export const note =
  "Resting state: the field, then RECENT as an editorial-footer art row.";

export default function SearchIdleTemplate() {
  return (
    <PartStage width="100%" height="100%" contain>
      <QueueSearch forcedState="idle" />
    </PartStage>
  );
}
