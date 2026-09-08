import { REVIEW_ALBUMS } from "./album-fixtures.ts"
import { SearchResults } from "./SearchResults.tsx"
export const name = "Search results"
export default function SearchResultsPart() {
  return <SearchResults query="radiohead" albums={REVIEW_ALBUMS} onOpen={() => {}} />
}
