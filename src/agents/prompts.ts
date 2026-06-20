import { getActivePromptModule } from "../services/promptModules";

export function loadPromptForAgent(promptModuleName: string) {
  return getActivePromptModule(promptModuleName);
}
