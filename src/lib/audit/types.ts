export type Severity = "error" | "warning" | "notice";

export type Finding = {
  id: string;
  code: string;
  severity: Severity;
  title: string;
  affectedUrl: string;
  observedEvidence: string;
  whyItMatters: string;
  recommendedAction: string;
};

export type AuditRun = {
  requestedUrl: string;
  canonicalUrl: string;
  fetchedAt: string;
  rulesVersion: string;
  findings: Finding[];
};

export class AuditError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "AuditError";
    this.code = code;
    this.status = status;
  }
}
