import type { AuvroraController } from "../app/controller.ts";
import { createAuvroraTools } from "./tools.ts";

export async function registerAuvroraTools(controller: AuvroraController): Promise<{
  supported: boolean;
  count: number;
  dispose: () => void;
}> {
  if (typeof document === "undefined" || !("modelContext" in document) || !document.modelContext) {
    return { supported: false, count: 0, dispose: () => {} };
  }

  const registrationController = new AbortController();
  const tools = createAuvroraTools(controller);
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
