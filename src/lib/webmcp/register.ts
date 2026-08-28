import type { LoopFixController } from "../app/controller.ts";
import { createLoopFixTools } from "./tools.ts";

export async function registerLoopFixTools(controller: LoopFixController): Promise<{
  supported: boolean;
  count: number;
  dispose: () => void;
}> {
  if (typeof document === "undefined" || !("modelContext" in document) || !document.modelContext) {
    return { supported: false, count: 0, dispose: () => {} };
  }

  const registrationController = new AbortController();
  const tools = createLoopFixTools(controller);
  try {
    for (const tool of tools) {
      await document.modelContext.registerTool(tool as WebMCP.ModelContextTool, {
        signal: registrationController.signal,
      });
    }
  } catch (error) {
    registrationController.abort();
    throw error;
  }

  return {
    supported: true,
    count: tools.length,
    dispose: () => registrationController.abort(),
  };
}
