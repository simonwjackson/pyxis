import { QueueSearch } from "@app/features/sandbox/QueueCoverflow/QueueSearch";
import { PartStage } from "./PartStage";

export const name = "Search — Live";
export const note =
  "Interactive: type to debounce, watch it load, then show results.";

export default function SearchTemplate() {
  return (
    <PartStage width="100%" height="100%" contain>
      <QueueSearch />
    </PartStage>
  );
}
