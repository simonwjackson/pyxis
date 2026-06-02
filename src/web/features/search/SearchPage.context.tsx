import { createContext, type ReactNode, useContext } from "react";
import type { SearchState } from "./SearchState";
import type { SearchTrack } from "./types";

export type SearchPageContextValue = {
  readonly state: SearchState;
  readonly playingAlbumId: string | null;
  readonly playAlbum: (albumId: string) => void;
  readonly saveAlbum: (albumId: string) => void;
  readonly startRadio: (track: SearchTrack) => void;
  readonly createStation: (musicToken: string) => void;
};

const SearchPageContext = createContext<SearchPageContextValue | null>(null);

export function SearchPageProvider({
  value,
  children,
}: {
  readonly value: SearchPageContextValue;
  readonly children: ReactNode;
}) {
  return (
    <SearchPageContext.Provider value={value}>
      {children}
    </SearchPageContext.Provider>
  );
}

export function useSearchPage(): SearchPageContextValue {
  const context = useContext(SearchPageContext);
  if (context === null) {
    throw new Error("useSearchPage must be used within SearchPageProvider");
  }
  return context;
}
