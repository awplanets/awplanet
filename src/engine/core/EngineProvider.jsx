/* eslint-disable react/prop-types */
import {
  useCallback,
  useMemo,
  useReducer,
} from "react";

import {
  createInitialEngineState,
  engineReducer,
} from "./engineReducer";
import { runAiCommand } from "../../ai/aiCommandLayer";
import { EngineContext } from "./useEngine";

export const EngineProvider = ({ children, initialState }) => {
  const [engineState, dispatch] = useReducer(
    engineReducer,
    initialState,
    createInitialEngineState
  );

  const runCommand = useCallback((command) => {
    dispatch(command);
  }, []);

  const runPrompt = useCallback((prompt) => {
    const commands = runAiCommand(prompt);
    dispatch({
      type: "run-command-batch",
      label: "AI command",
      commands,
    });
  }, []);

  const previewPrompt = useCallback((prompt) => runAiCommand(prompt), []);

  const value = useMemo(
    () => ({
      engineState,
      previewPrompt,
      runCommand,
      runPrompt,
    }),
    [engineState, previewPrompt, runCommand, runPrompt]
  );

  return (
    <EngineContext.Provider value={value}>{children}</EngineContext.Provider>
  );
};
