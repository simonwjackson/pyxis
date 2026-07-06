import { QueueSearch } from "@app/features/sandbox/QueueCoverflow/QueueSearch";
import { PartStage } from "./PartStage";

export const name = "Search — Loading";
export const note = "Query in flight: the grid fills with pulsing skeletons.";

export default function SearchLoadingTemplate() {
  return (
    <PartStage width="100%" height="100%" contain>
      <QueueSearch forcedState="loading" forcedQuery="ocean" />
    </PartStage>
  );
}
