import { useSearchPage } from "../SearchPage.context";
import { SearchResultsEmpty } from "./SearchResultsEmpty";

export function SearchEmptyState() {
  const { state } = useSearchPage();
  if (state._tag !== "Empty") return null;

  return <SearchResultsEmpty />;
}
