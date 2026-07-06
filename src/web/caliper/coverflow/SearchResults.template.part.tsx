import { QueueSearch } from "@app/features/sandbox/QueueCoverflow/QueueSearch";
import { PartStage } from "./PartStage";

export const name = "Search — Results";
export const note =
  "Search results as an art grid; minimal 'load more' + count footer.";

export default function SearchResultsTemplate() {
  return (
    <PartStage width="100%" height="100%" contain>
      <QueueSearch forcedState="results" forcedQuery="ocean" />
    </PartStage>
  );
}
