import { createContext, type ReactNode, useContext } from "react";
import type { StationDetailState } from "./StationDetailState";

export type StationDetailPageContextValue = {
  readonly state: StationDetailState;
  readonly token: string;
  readonly showAddSeed: boolean;
  readonly isPlaying: boolean;
  readonly isRemovingSeed: boolean;
  readonly back: () => void;
  readonly play: () => void;
  readonly openAddSeed: () => void;
  readonly closeAddSeed: () => void;
  readonly removeSeed: (seedId: string) => void;
};

const StationDetailPageContext =
  createContext<StationDetailPageContextValue | null>(null);

export function StationDetailPageProvider({
  value,
  children,
}: {
  readonly value: StationDetailPageContextValue;
  readonly children: ReactNode;
}) {
  return (
    <StationDetailPageContext.Provider value={value}>
      {children}
    </StationDetailPageContext.Provider>
  );
}

export function useStationDetailPage(): StationDetailPageContextValue {
  const context = useContext(StationDetailPageContext);
  if (context === null) {
    throw new Error(
      "useStationDetailPage must be used within StationDetailPageProvider",
    );
  }
  return context;
}
