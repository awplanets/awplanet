import { createContext, useContext } from "react";

export const EngineContext = createContext(null);

export const useEngine = () => {
  const context = useContext(EngineContext);

  if (!context) {
    throw new Error("useEngine must be used inside EngineProvider.");
  }

  return context;
};
