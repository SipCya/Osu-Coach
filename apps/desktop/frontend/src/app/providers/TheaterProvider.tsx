import React, { createContext, useContext } from "react";
import { AppTheater } from "../services/common/CommonManagers";

export const TheaterContext = createContext<AppTheater | null>(null);

interface TheaterProviderProps {
  theater: AppTheater;
  children: React.ReactNode;
}

export function TheaterProvider({ theater, children }: TheaterProviderProps) {
  return <TheaterContext.Provider value={theater}>{children}</TheaterContext.Provider>;
}

export function useTheaterContext() {
  const context = useContext(TheaterContext);
  if (!context) {
    throw Error("useTheaterContext can only be used within a TheaterProvider");
  }
  return context;
}

export function useCommonManagers() {
  const theater = useTheaterContext();
  return theater.common;
}

export function useAnalysisApp() {
  const theater = useTheaterContext();
  return theater.analyzer;
}
