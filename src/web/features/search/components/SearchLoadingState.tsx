import { Spinner } from "@app/shared/ui/Spinner";
import { useSearchPage } from "../SearchPage.context";

export function SearchLoadingState() {
  const { state } = useSearchPage();
  if (state._tag !== "Loading") return null;

  return (
    <div className="flex justify-center py-8">
      <Spinner />
    </div>
  );
}
