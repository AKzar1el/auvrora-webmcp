import assert from "node:assert/strict";
import { describe, expect, it } from "vitest";
import type { AuditRun, Finding, Severity } from "../src/lib/audit/types.ts";
import type { AuvroraController } from "../src/lib/app/controller.ts";
import type { AuvroraState } from "../src/lib/app/state.ts";
import { AUVRORA_TOOL_SCHEMAS } from "../src/lib/webmcp/schemas.ts";
import { createAuvroraTools } from "../src/lib/webmcp/tools.ts";
import { registerAuvroraTools } from "../src/lib/webmcp/register.ts";

function finding(index: number, severity: Severity = "warning"): Finding {
  const code = `rule_${index}`;
  return {
    id: `finding:${code}`,
    code,
    severity,
    title: `Finding number ${index}`,
    affectedUrl: `https://example.org/${"very-long-path/".repeat(20)}${index}`,
    observedEvidence: "Generated evidence. ".repeat(30),
    whyItMatters: "A bounded reason explaining why the deterministic finding matters.",
    recommendedAction: "Apply one bounded change and re-audit the page.",
  };
}

function audit(findings = Array.from({ length: 12 }, (_, index) => finding(index))): AuditRun {
  return {
    requestedUrl: "https://example.org/",
    canonicalUrl: "https://example.org/",
    fetchedAt: "2026-08-28T20:00:00.000Z",
    rulesVersion: "2026-08-28.1",
    findings,
  };
}

function fakeController() {
  const calls: Array<{ name: string; value?: unknown; signal?: AbortSignal }> = [];
  let state: AuvroraState = {
    mode: "live",
    audit: audit(),
    selectedFindingIds: [],
    verification: null,
  };
  const controller: AuvroraController = {
    async runAudit(url, signal) {
      calls.push({ name: "runAudit", value: url, signal });
      return state.audit!;
    },
    loadDemo() { calls.push({ name: "loadDemo" }); return state.audit!; },
    listFindings(input) {
      calls.push({ name: "listFindings", value: input });
      let values = state.audit?.findings ?? [];
      if (input?.severity) values = values.filter((item) => item.severity === input.severity);
      return values.slice(0, input?.limit ?? 10);
    },
    inspectFinding(id) {
      calls.push({ name: "inspectFinding", value: id });
      const value = state.audit?.findings.find((item) => item.id === id);
      if (!value) throw new Error("Finding not found.");
      return value;
    },
    setFixScope(ids) {
      calls.push({ name: "setFixScope", value: ids });
      state = { ...state, selectedFindingIds: [...ids] };
    },
    async verifyFixScope(signal) {
      calls.push({ name: "verifyFixScope", signal });
      return state.selectedFindingIds.map((findingId) => ({ findingId, status: "fixed" as const }));
    },
    getState() { return state; },
  };
  return { controller, calls };
}

function executeWithoutOptions(tool: { execute: unknown }, input: unknown) {
  const execute = tool.execute as (input: unknown) => Promise<unknown>;
  return execute(input);
}

describe("WebMCP schema contract", () => {
  it("defines exactly five stable object schemas without additional properties", () => {
    expect(Object.keys(AUVRORA_TOOL_SCHEMAS).sort()).toEqual([
      "inspect_finding",
      "list_findings",
      "run_audit",
      "set_fix_scope",
      "verify_fix_scope",
    ]);
    for (const schema of Object.values(AUVRORA_TOOL_SCHEMAS)) {
      expect(schema.type).toBe("object");
      expect(schema.additionalProperties).toBe(false);
    }
  });

  it("exposes the approved annotations and concise descriptions", () => {
    const { controller } = fakeController();
    const tools = createAuvroraTools(controller);
    const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
    expect(byName.run_audit.annotations).toEqual({ readOnlyHint: false, untrustedContentHint: true });
    expect(byName.list_findings.annotations).toEqual({ readOnlyHint: true, untrustedContentHint: true });
    expect(byName.inspect_finding.annotations).toEqual({ readOnlyHint: true, untrustedContentHint: true });
    expect(byName.set_fix_scope.annotations).toEqual({ readOnlyHint: false, untrustedContentHint: true });
    expect(byName.verify_fix_scope.annotations).toEqual({ readOnlyHint: false, untrustedContentHint: true });
    for (const tool of tools) {
      assert.ok(tool.description.length > 0 && tool.description.length < 500);
      assert.ok(!/ignore (previous|all)|system prompt|developer message/i.test(tool.description));
    }
  });
});

describe("WebMCP handlers", () => {
  it("forwards run_audit and verify_fix_scope AbortSignals", async () => {
    const { controller, calls } = fakeController();
    const tools = createAuvroraTools(controller);
    const run = tools.find((tool) => tool.name === "run_audit")!;
    const verify = tools.find((tool) => tool.name === "verify_fix_scope")!;
    const abort = new AbortController();
    await run.execute({ url: "https://example.org/" }, { signal: abort.signal });
    controller.setFixScope(["finding:rule_0"]);
    await verify.execute({}, { signal: abort.signal });
    expect(calls.find((call) => call.name === "runAudit")?.signal).toBe(abort.signal);
    expect(calls.find((call) => call.name === "verifyFixScope")?.signal).toBe(abort.signal);
  });

  it("runs run_audit when Chrome omits callback execution options", async () => {
    const { controller, calls } = fakeController();
    const run = createAuvroraTools(controller).find((tool) => tool.name === "run_audit")!;
    await executeWithoutOptions(run, { url: "https://example.org/" });
    const call = calls.find((item) => item.name === "runAudit");
    expect(call?.value).toBe("https://example.org/");
    expect(call?.signal).toBeUndefined();
  });

  it("runs verify_fix_scope when Chrome omits callback execution options", async () => {
    const { controller, calls } = fakeController();
    const tools = createAuvroraTools(controller);
    const verify = tools.find((tool) => tool.name === "verify_fix_scope")!;
    controller.setFixScope(["finding:rule_0"]);
    await executeWithoutOptions(verify, {});
    expect(calls.find((item) => item.name === "verifyFixScope")?.signal).toBeUndefined();
  });

  it("strictly rejects unknown keys and invalid input types before controller calls", async () => {
    const { controller, calls } = fakeController();
    const tools = createAuvroraTools(controller);
    const run = tools.find((tool) => tool.name === "run_audit")!;
    const list = tools.find((tool) => tool.name === "list_findings")!;
    const inspect = tools.find((tool) => tool.name === "inspect_finding")!;
    const scope = tools.find((tool) => tool.name === "set_fix_scope")!;
    const verify = tools.find((tool) => tool.name === "verify_fix_scope")!;
    const signal = new AbortController().signal;

    await assert.rejects(() => run.execute({ url: "https://example.org/", extra: true }, { signal }));
    await assert.rejects(() => list.execute({ limit: 11 }, { signal }));
    await assert.rejects(() => inspect.execute({ findingId: 5 }, { signal }));
    await assert.rejects(() => scope.execute({ findingIds: [] }, { signal }));
    await assert.rejects(() => verify.execute({ url: "https://other.example/" }, { signal }));
    expect(calls).toEqual([]);
  });

  it("keeps read-only tools read-only", async () => {
    const { controller, calls } = fakeController();
    const tools = createAuvroraTools(controller);
    const signal = new AbortController().signal;
    await tools.find((tool) => tool.name === "list_findings")!.execute({ limit: 2 }, { signal });
    await tools.find((tool) => tool.name === "inspect_finding")!.execute({ findingId: "finding:rule_0" }, { signal });
    expect(calls.some((call) => call.name === "setFixScope" || call.name === "runAudit" || call.name === "verifyFixScope")).toBeFalsy();
  });

  it("bounds list and inspection results without returning raw HTML", async () => {
    const { controller } = fakeController();
    const tools = createAuvroraTools(controller);
    const signal = new AbortController().signal;
    const list = await tools.find((tool) => tool.name === "list_findings")!.execute({ limit: 10 }, { signal });
    const inspected = await tools.find((tool) => tool.name === "inspect_finding")!.execute({ findingId: "finding:rule_0" }, { signal });
    assert.ok(JSON.stringify(list).length <= 1500);
    assert.ok(JSON.stringify(inspected).length <= 1500);
    assert.ok(!JSON.stringify(inspected).includes("<script"));
  });

  it("reports filtered availability independently from the requested list limit", async () => {
    const { controller } = fakeController();
    const list = createAuvroraTools(controller).find((tool) => tool.name === "list_findings")!;
    const result = await list.execute({ limit: 2 }, { signal: new AbortController().signal }) as {
      returned: number;
      available: number;
      truncated: boolean;
    };
    assert.deepEqual(result, { ...result, returned: 2, available: 12, truncated: true });
  });

  it("preserves AbortError cancellation instead of converting it into a generic tool failure", async () => {
    const { controller } = fakeController();
    controller.runAudit = async () => { throw new DOMException("Cancelled", "AbortError"); };
    const run = createAuvroraTools(controller).find((tool) => tool.name === "run_audit")!;
    await assert.rejects(
      () => run.execute({ url: "https://example.org/" }, { signal: new AbortController().signal }),
      (error: unknown) => error instanceof DOMException && error.name === "AbortError",
    );
  });

  it("turns controller failures into short actionable errors", async () => {
    const { controller } = fakeController();
    controller.inspectFinding = () => { throw new Error("x".repeat(1000)); };
    const inspect = createAuvroraTools(controller).find((tool) => tool.name === "inspect_finding")!;
    await assert.rejects(() => inspect.execute({ findingId: "finding:rule_0" }, { signal: new AbortController().signal }), (error: unknown) => {
      if (!(error instanceof Error)) return false;
      assert.ok(error.message.length <= 220);
      return true;
    });
  });
});

describe("WebMCP registration", () => {
  it("registers all five tools with one disposable registration signal", async () => {
    const { controller } = fakeController();
    const registrations: Array<{ name: string; signal: AbortSignal }> = [];
    const originalDocument = Reflect.get(globalThis, "document");
    Reflect.set(globalThis, "document", {
      modelContext: {
        async registerTool(tool: { name: string }, options: { signal: AbortSignal }) {
          registrations.push({ name: tool.name, signal: options.signal });
        },
      },
    });
    try {
      const result = await registerAuvroraTools(controller);
      expect(result.supported).toBe(true);
      expect(result.count).toBe(5);
      expect(registrations.map((item) => item.name).sort()).toEqual([
        "inspect_finding", "list_findings", "run_audit", "set_fix_scope", "verify_fix_scope",
      ]);
      expect(new Set(registrations.map((item) => item.signal)).size).toBe(1);
      result.dispose();
      expect(registrations[0].signal.aborted).toBeTruthy();
    } finally {
      if (originalDocument === undefined) Reflect.deleteProperty(globalThis, "document");
      else Reflect.set(globalThis, "document", originalDocument);
    }
  });

  it("returns an inert result when the browser does not expose modelContext", async () => {
    const { controller } = fakeController();
    const result = await registerAuvroraTools(controller);
    expect(result.supported).toBe(false);
    expect(result.count).toBe(0);
    result.dispose();
  });
});
