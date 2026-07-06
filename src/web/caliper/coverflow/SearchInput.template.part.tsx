import { QueueSearch } from "@app/features/sandbox/QueueCoverflow/QueueSearch";
import { PartStage } from "./PartStage";

export const name = "Search — Input";
export const note =
  "Active state: tapping the icon opens the input over the deck.";

export default function SearchInputTemplate() {
  return (
    <PartStage width="100%" height="100%" contain>
      <QueueSearch forcedState="results" forcedQuery="ocean" forcedActive />
    </PartStage>
  );
}
