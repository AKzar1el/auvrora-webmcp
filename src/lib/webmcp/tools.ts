import type { LoopFixController } from "../app/controller.ts";
import type { Severity } from "../audit/types.ts";
import { LOOPFIX_TOOL_SCHEMAS } from "./schemas.ts";

export type ToolExecutionOptions = { signal?: AbortSignal };

export type LoopFixToolDefinition = {
  name: keyof typeof LOOPFIX_TOOL_SCHEMAS;
  title: string;
  description: string;
  inputSchema: (typeof LOOPFIX_TOOL_SCHEMAS)[keyof typeof LOOPFIX_TOOL_SCHEMAS];
  annotations: {
    readOnlyHint: boolean;
    untrustedContentHint: boolean;
  };
  execute: (input: unknown, options?: ToolExecutionOptions) => Promise<unknown>;
};

const MAX_TOOL_RESULT_CHARS = 1500;
const MAX_ERROR_CHARS = 200;
const MAX_URL_CHARS = 180;
const MAX_TEXT_CHARS = 260;

function clip(value: unknown, limit: number): string {
  const text = String(value ?? "");
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1))}…`;
}

function asObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Tool input must be a JSON object.");
  }
  return input as Record<string, unknown>;
}

function assertKeys(input: Record<string, unknown>, allowed: readonly string[]) {
  const allowedKeys = new Set(allowed);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) {
    throw new Error("Tool input contains an unsupported property.");
  }
}

export function assertRunAuditInput(input: unknown): { url: string } {
  const value = asObject(input);
  assertKeys(value, ["url"]);
  if (typeof value.url !== "string" || !value.url.trim() || value.url.length > 2048) {
    throw new Error("url must be a non-empty public page URL up to 2048 characters.");
  }
  return { url: value.url.trim() };
}

export function assertListFindingsInput(input: unknown): { severity?: Severity; limit?: number } {
  const value = asObject(input);
  assertKeys(value, ["severity", "limit"]);
  const result: { severity?: Severity; limit?: number } = {};
  if (value.severity !== undefined) {
    if (value.severity !== "error" && value.severity !== "warning" && value.severity !== "notice") {
      throw new Error("severity must be error, warning, or notice.");
    }
    result.severity = value.severity;
  }
  if (value.limit !== undefined) {
    if (!Number.isInteger(value.limit) || Number(value.limit) < 1 || Number(value.limit) > 10) {
      throw new Error("limit must be an integer from 1 to 10.");
    }
    result.limit = Number(value.limit);
  }
  return result;
}

export function assertInspectFindingInput(input: unknown): { findingId: string } {
  const value = asObject(input);
  assertKeys(value, ["findingId"]);
  if (typeof value.findingId !== "string" || !value.findingId.trim() || value.findingId.length > 160) {
    throw new Error("findingId must be a current finding ID.");
  }
  return { findingId: value.findingId };
}

export function assertSetFixScopeInput(input: unknown): { findingIds: string[] } {
  const value = asObject(input);
  assertKeys(value, ["findingIds"]);
  if (!Array.isArray(value.findingIds) || value.findingIds.length < 1 || value.findingIds.length > 10) {
    throw new Error("findingIds must contain between 1 and 10 current finding IDs.");
  }
  if (value.findingIds.some((id) => typeof id !== "string" || !id.trim() || id.length > 160)) {
    throw new Error("findingIds must contain only valid finding ID strings.");
  }
  const ids = value.findingIds as string[];
  if (new Set(ids).size !== ids.length) throw new Error("findingIds must be unique.");
  return { findingIds: [...ids] };
}

export function assertEmptyInput(input: unknown): Record<string, never> {
  const value = asObject(input);
  assertKeys(value, []);
  return {};
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return clip(error.message, MAX_ERROR_CHARS);
  return "The requested LoopFix action could not be completed.";
}

async function safeExecute<T>(operation: () => Promise<T> | T): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error(errorMessage(error));
  }
}

function auditSummary(audit: Awaited<ReturnType<LoopFixController["runAudit"]>>) {
  const counts = { error: 0, warning: 0, notice: 0 };
  for (const finding of audit.findings) counts[finding.severity] += 1;
  return {
    canonicalUrl: clip(audit.canonicalUrl, MAX_URL_CHARS),
    totalFindings: audit.findings.length,
    counts,
    next: audit.findings.length ? "Use list_findings to inspect the bounded results." : "No findings were produced by the current rules.",
  };
}

function boundedFindingList(controller: LoopFixController, input: { severity?: Severity; limit?: number }) {
  const state = controller.getState();
  const selected = new Set(state.selectedFindingIds);
  const available = (state.audit?.findings ?? []).filter((finding) => !input.severity || finding.severity === input.severity).length;
  const findings = controller.listFindings(input);
  const result: Array<Record<string, unknown>> = [];
  for (const finding of findings) {
    const row = {
      id: clip(finding.id, 80),
      severity: finding.severity,
      code: clip(finding.code, 48),
      title: clip(finding.title, 64),
      affectedUrl: clip(finding.affectedUrl, 96),
      selected: selected.has(finding.id),
    };
    const candidate = { findings: [...result, row], returned: result.length + 1, available };
    if (JSON.stringify(candidate).length > MAX_TOOL_RESULT_CHARS) break;
    result.push(row);
  }
  return {
    findings: result,
    returned: result.length,
    available,
    truncated: result.length < available,
  };
}

export function createLoopFixTools(controller: LoopFixController): LoopFixToolDefinition[] {
  return [
    {
      name: "run_audit",
      title: "Run page audit",
      description: "Run LoopFix's bounded deterministic audit for one public HTTP or HTTPS page and make it the active visible audit.",
      inputSchema: LOOPFIX_TOOL_SCHEMAS.run_audit,
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: (input, options) => safeExecute(async () => {
        const { url } = assertRunAuditInput(input);
        return auditSummary(await controller.runAudit(url, options?.signal));
      }),
    },
    {
      name: "list_findings",
      title: "List audit findings",
      description: "List compact findings from the active LoopFix audit, optionally filtered by severity. Returns at most the requested limit and may truncate for output safety.",
      inputSchema: LOOPFIX_TOOL_SCHEMAS.list_findings,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: (input) => safeExecute(() => boundedFindingList(controller, assertListFindingsInput(input))),
    },
    {
      name: "inspect_finding",
      title: "Inspect audit finding",
      description: "Inspect one current finding's bounded evidence, rationale, and deterministic remediation guidance by finding ID.",
      inputSchema: LOOPFIX_TOOL_SCHEMAS.inspect_finding,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: (input) => safeExecute(() => {
        const { findingId } = assertInspectFindingInput(input);
        const finding = controller.inspectFinding(findingId);
        return {
          id: clip(finding.id, 80),
          code: clip(finding.code, 48),
          severity: finding.severity,
          title: clip(finding.title, 80),
          affectedUrl: clip(finding.affectedUrl, MAX_URL_CHARS),
          observedEvidence: clip(finding.observedEvidence, MAX_TEXT_CHARS),
          whyItMatters: clip(finding.whyItMatters, MAX_TEXT_CHARS),
          recommendedAction: clip(finding.recommendedAction, MAX_TEXT_CHARS),
        };
      }),
    },
    {
      name: "set_fix_scope",
      title: "Set fix scope",
      description: "Set the visible LoopFix fix scope to one through ten finding IDs from the active audit. This changes only local application state.",
      inputSchema: LOOPFIX_TOOL_SCHEMAS.set_fix_scope,
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: (input) => safeExecute(() => {
        const { findingIds } = assertSetFixScopeInput(input);
        controller.setFixScope(findingIds);
        return {
          selectedCount: findingIds.length,
          findingIds: findingIds.map((id) => clip(id, 80)),
          next: "The visible fix scope is updated. Implement changes outside LoopFix, then use verify_fix_scope.",
        };
      }),
    },
    {
      name: "verify_fix_scope",
      title: "Verify fix scope",
      description: "Re-audit the active canonical URL and compare the selected finding IDs. No replacement URL is accepted.",
      inputSchema: LOOPFIX_TOOL_SCHEMAS.verify_fix_scope,
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: (input, options) => safeExecute(async () => {
        assertEmptyInput(input);
        const results = await controller.verifyFixScope(options?.signal);
        const totals = { fixed: 0, stillPresent: 0, notVerifiable: 0 };
        for (const result of results) {
          if (result.status === "fixed") totals.fixed += 1;
          else if (result.status === "still_present") totals.stillPresent += 1;
          else totals.notVerifiable += 1;
        }
        return {
          results: results.map((result) => ({ findingId: clip(result.findingId, 80), status: result.status })),
          totals,
        };
      }),
    },
  ];
}
