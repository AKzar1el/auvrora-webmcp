import { demoAfter } from "../../demo/after.ts";
import { demoBefore } from "../../demo/before.ts";
import type { AuditRun, Finding, Severity } from "../audit/types.ts";
import { createAuditClient } from "./audit-client.ts";
import { createLoopFixStore, type LoopFixState } from "./state.ts";
import { compareSelectedFindings, type VerificationResult } from "./verification.ts";

export type LoopFixController = {
  runAudit(url: string, signal?: AbortSignal): Promise<AuditRun>;
  loadDemo(): AuditRun;
  listFindings(input?: { severity?: Severity; limit?: number }): Finding[];
  inspectFinding(findingId: string): Finding;
  setFixScope(findingIds: string[]): void;
  verifyFixScope(signal?: AbortSignal): Promise<VerificationResult[]>;
  getState(): LoopFixState;
};

export type LoopFixUiController = LoopFixController & {
  clearFixScope(): void;
  subscribe(subscriber: (state: LoopFixState) => void): () => void;
};

type AuditClient = (url: string, signal?: AbortSignal) => Promise<AuditRun>;

type ControllerOptions = {
  auditClient?: AuditClient;
  demoBeforeRun?: AuditRun;
  demoAfterRun?: AuditRun;
};

export function createLoopFixController(options: ControllerOptions = {}): LoopFixUiController {
  const store = createLoopFixStore();
  const auditClient = options.auditClient ?? createAuditClient();
  const beforeDemo = options.demoBeforeRun ?? demoBefore;
  const afterDemo = options.demoAfterRun ?? demoAfter;

  return {
    async runAudit(url, signal) {
      const audit = await auditClient(url, signal);
      store.replaceAudit(audit, "live");
      return audit;
    },

    loadDemo() {
      store.replaceAudit(beforeDemo, "demo");
      return beforeDemo;
    },

    listFindings(input = {}) {
      const findings = store.getState().audit?.findings ?? [];
      const filtered = input.severity
        ? findings.filter((finding) => finding.severity === input.severity)
        : findings;
      const requestedLimit = Number.isInteger(input.limit) ? Number(input.limit) : 10;
      const limit = Math.min(10, Math.max(1, requestedLimit));
      return filtered.slice(0, limit);
    },

    inspectFinding(findingId) {
      const finding = store.getState().audit?.findings.find((item) => item.id === findingId);
      if (!finding) throw new Error("Finding not found in the active audit.");
      return finding;
    },

    setFixScope(findingIds) {
      store.setScope(findingIds);
    },

    clearFixScope() {
      store.clearScope();
    },

    async verifyFixScope(signal) {
      const state = store.getState();
      if (!state.audit) throw new Error("Run an audit before verification.");
      if (state.selectedFindingIds.length === 0) throw new Error("Select a fix scope before verification.");

      const freshAudit = state.mode === "demo"
        ? afterDemo
        : await auditClient(state.audit.canonicalUrl, signal);
      const results = compareSelectedFindings([...state.selectedFindingIds], state.audit, freshAudit);
      store.setVerification(freshAudit, results);
      return results;
    },

    getState() {
      return store.getState();
    },

    subscribe(subscriber) {
      return store.subscribe(subscriber);
    },
  };
}
