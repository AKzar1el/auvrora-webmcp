import type { AuditRun, Finding } from "../audit/types.ts";
import type { VerificationResult } from "./verification.ts";

export type LoopFixMode = "live" | "demo";

export type LoopFixState = {
  mode: LoopFixMode;
  audit: AuditRun | null;
  selectedFindingIds: readonly string[];
  verification: {
    audit: AuditRun;
    results: readonly VerificationResult[];
  } | null;
};

type Subscriber = (state: LoopFixState) => void;

function freezeFinding(finding: Finding): Finding {
  return Object.freeze({ ...finding });
}

function freezeAudit(audit: AuditRun): AuditRun {
  return Object.freeze({
    ...audit,
    findings: Object.freeze(audit.findings.map(freezeFinding)),
  }) as AuditRun;
}

function makeState(
  mode: LoopFixMode,
  audit: AuditRun | null,
  selectedFindingIds: readonly string[],
  verification: LoopFixState["verification"],
): LoopFixState {
  const frozenVerification = verification
    ? Object.freeze({
        audit: freezeAudit(verification.audit),
        results: Object.freeze(verification.results.map((result) => Object.freeze({ ...result }))),
      })
    : null;

  return Object.freeze({
    mode,
    audit: audit ? freezeAudit(audit) : null,
    selectedFindingIds: Object.freeze([...selectedFindingIds]),
    verification: frozenVerification,
  });
}

export function createLoopFixStore() {
  let state = makeState("live", null, [], null);
  const subscribers = new Set<Subscriber>();

  const emit = () => {
    for (const subscriber of subscribers) subscriber(state);
  };

  const replace = (next: LoopFixState) => {
    state = next;
    emit();
  };

  return {
    getState(): LoopFixState {
      return state;
    },

    subscribe(subscriber: Subscriber): () => void {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },

    replaceAudit(audit: AuditRun, mode: LoopFixMode): void {
      replace(makeState(mode, audit, [], null));
    },

    setScope(findingIds: string[]): void {
      if (!state.audit) throw new Error("Run an audit before setting a fix scope.");
      if (findingIds.length < 1 || findingIds.length > 10) {
        throw new Error("Fix scope must contain between 1 and 10 findings.");
      }
      if (new Set(findingIds).size !== findingIds.length) {
        throw new Error("Fix scope finding IDs must be unique.");
      }
      const currentIds = new Set(state.audit.findings.map((finding) => finding.id));
      if (findingIds.some((findingId) => !currentIds.has(findingId))) {
        throw new Error("Fix scope can contain only findings from the active audit.");
      }
      replace(makeState(state.mode, state.audit, findingIds, null));
    },

    clearScope(): void {
      if (!state.audit) return;
      replace(makeState(state.mode, state.audit, [], null));
    },

    setVerification(audit: AuditRun, results: VerificationResult[]): void {
      if (!state.audit || state.selectedFindingIds.length === 0) {
        throw new Error("Select a fix scope before storing verification results.");
      }
      const selected = new Set(state.selectedFindingIds);
      if (results.some((result) => !selected.has(result.findingId))) {
        throw new Error("Verification results must belong to the active fix scope.");
      }
      replace(makeState(state.mode, state.audit, state.selectedFindingIds, { audit, results }));
    },

    reset(): void {
      replace(makeState("live", null, [], null));
    },
  };
}
