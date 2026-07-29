import { parseAiPromptToCommands } from "../engine/layers/commands/aiIntentParser";

export const runAiCommand = (prompt) => parseAiPromptToCommands(prompt);
