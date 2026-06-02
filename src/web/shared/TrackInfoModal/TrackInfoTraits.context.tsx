import { createContext, type ReactNode, useContext } from "react";
import type { TrackInfoState } from "./TrackInfoState";

export type TrackInfoTraitsContextValue = {
  readonly state: TrackInfoState;
};

const TrackInfoTraitsContext =
  createContext<TrackInfoTraitsContextValue | null>(null);

export function TrackInfoTraitsProvider({
  value,
  children,
}: {
  readonly value: TrackInfoTraitsContextValue;
  readonly children: ReactNode;
}) {
  return (
    <TrackInfoTraitsContext.Provider value={value}>
      {children}
    </TrackInfoTraitsContext.Provider>
  );
}

export function useTrackInfoTraits(): TrackInfoTraitsContextValue {
  const context = useContext(TrackInfoTraitsContext);
  if (context === null) {
    throw new Error(
      "useTrackInfoTraits must be used within TrackInfoTraitsProvider",
    );
  }
  return context;
}
