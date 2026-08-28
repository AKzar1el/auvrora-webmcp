import type { AuditRun, Finding, Severity } from "../audit/types.ts";

export class AuditClientError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "AuditClientError";
    this.code = code;
    this.status = status;
  }
}

type AuditClient = (url: string, signal?: AbortSignal) => Promise<AuditRun>;

const SEVERITIES = new Set<Severity>(["error", "warning", "notice"]);

function isFinding(value: unknown): value is Finding {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string"
    && typeof item.code === "string"
    && typeof item.severity === "string"
    && SEVERITIES.has(item.severity as Severity)
    && typeof item.title === "string"
    && typeof item.affectedUrl === "string"
    && typeof item.observedEvidence === "string"
    && typeof item.whyItMatters === "string"
    && typeof item.recommendedAction === "string";
}

function isAuditRun(value: unknown): value is AuditRun {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.requestedUrl === "string"
    && typeof item.canonicalUrl === "string"
    && typeof item.fetchedAt === "string"
    && typeof item.rulesVersion === "string"
    && Array.isArray(item.findings)
    && item.findings.every(isFinding);
}

function readErrorBody(value: unknown): { code: string; message: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { code: "request_failed", message: "The audit request failed." };
  }
  const body = value as Record<string, unknown>;
  return {
    code: typeof body.error === "string" && body.error ? body.error : "request_failed",
    message: typeof body.message === "string" && body.message ? body.message : "The audit request failed.",
  };
}

export function createAuditClient(fetchImpl: typeof fetch = fetch): AuditClient {
  return async (url, signal) => {
    const response = await fetchImpl("/api/audit", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ url }),
      signal,
    });

    const parsed = await response.json().catch(() => null);
    if (!response.ok) {
      const error = readErrorBody(parsed);
      throw new AuditClientError(error.code, error.message, response.status);
    }
    if (!isAuditRun(parsed)) {
      throw new AuditClientError("invalid_response", "The server returned an invalid audit response.", 502);
    }
    return parsed;
  };
}
