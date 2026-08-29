import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { LoopFixController } from "../src/lib/app/controller.ts";
import { LOOPFIX_TOOL_SCHEMAS } from "../src/lib/webmcp/schemas.ts";
import { createLoopFixTools } from "../src/lib/webmcp/tools.ts";

const ROOT = resolve(import.meta.dirname, "..");
const TOOLS_PATH = resolve(ROOT, "evals/tools.json");
const EVALS_PATH = resolve(ROOT, "evals/webmcp-evals.json");

const TOOL_NAMES = [
  "inspect_finding",
  "list_findings",
  "run_audit",
  "set_fix_scope",
  "verify_fix_scope",
] as const;

type ToolName = (typeof TOOL_NAMES)[number];

type EvalCall = {
  functionName?: string;
  arguments?: unknown;
  optional?: boolean;
  ordered?: EvalCall[];
  unordered?: EvalCall[];
};

type EvalCase = {
  name?: string;
  messages?: Array<{ role?: string; type?: string; content?: string }>;
  expectedCall?: EvalCall[] | null;
};

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function flattenCalls(nodes: EvalCall[]): EvalCall[] {
  return nodes.flatMap((node) => {
    if (node.ordered) return flattenCalls(node.ordered);
    if (node.unordered) return flattenCalls(node.unordered);
    return [node];
  });
}

function inertController(): LoopFixController {
  return {
    runAudit: async () => { throw new Error("not used by eval snapshot test"); },
    loadDemo: () => { throw new Error("not used by eval snapshot test"); },
    listFindings: () => [],
    inspectFinding: () => { throw new Error("not used by eval snapshot test"); },
    setFixScope: () => {},
    verifyFixScope: async () => [],
    getState: () => ({ mode: "live", audit: null, selectedFindingIds: [], verification: null }),
  };
}

describe("WebMCP eval artifacts", () => {
  it("ships official-format tool and journey fixtures", () => {
    expect(existsSync(TOOLS_PATH), "evals/tools.json must exist").toBe(true);
    expect(existsSync(EVALS_PATH), "evals/webmcp-evals.json must exist").toBe(true);
  });

  it("keeps the static eval tool snapshot aligned with the production WebMCP contract", () => {
    const snapshot = readJson(TOOLS_PATH) as { tools?: Array<Record<string, unknown>> };
    expect(Array.isArray(snapshot.tools)).toBe(true);

    const production = createLoopFixTools(inertController())
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const serialized = [...(snapshot.tools ?? [])]
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));

    expect(serialized).toEqual(production);
    expect(production.map((tool) => tool.name)).toEqual([...TOOL_NAMES].sort());
    for (const tool of production) {
      expect(tool.inputSchema).toEqual(LOOPFIX_TOOL_SCHEMAS[tool.name as ToolName]);
    }
  });

  it("contains ten realistic direct, ambiguous, journey, recovery, and refusal evals", () => {
    const evals = readJson(EVALS_PATH) as EvalCase[];
    expect(Array.isArray(evals)).toBe(true);
    expect(evals).toHaveLength(10);

    const names = evals.map((entry) => entry.name ?? "");
    for (const category of ["direct", "ambiguous", "journey", "recovery", "refusal"]) {
      expect(names.some((name) => name.startsWith(`[${category}]`)), `missing ${category} eval`).toBe(true);
    }

    expect(evals.some((entry) => entry.expectedCall === null), "suite needs a no-tool/refusal case").toBe(true);
    expect(evals.some((entry) => (entry.expectedCall?.length ?? 0) >= 4), "suite needs a multi-step journey").toBe(true);
  });

  it("uses only current LoopFix tools and valid user-message / expectedCall shapes", () => {
    const evals = readJson(EVALS_PATH) as EvalCase[];
    const allowed = new Set<string>(TOOL_NAMES);

    for (const entry of evals) {
      expect(typeof entry.name).toBe("string");
      expect(entry.name?.length).toBeGreaterThan(0);
      expect(Array.isArray(entry.messages)).toBe(true);
      expect(entry.messages?.length).toBeGreaterThan(0);

      for (const message of entry.messages ?? []) {
        expect(message.role).toBe("user");
        expect(message.type).toBe("message");
        expect(typeof message.content).toBe("string");
        expect(message.content?.trim().length).toBeGreaterThan(0);
      }

      if (entry.expectedCall === null) continue;
      expect(Array.isArray(entry.expectedCall)).toBe(true);
      for (const call of flattenCalls(entry.expectedCall ?? [])) {
        expect(allowed.has(call.functionName ?? ""), `unknown eval tool ${call.functionName}`).toBe(true);
      }
    }
  });
});
