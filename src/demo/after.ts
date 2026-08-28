import { createFinding } from "../lib/audit/findings.ts";
import type { AuditRun } from "../lib/audit/types.ts";
import { AUDIT_RULES_VERSION } from "../lib/audit/analyze-page.ts";

const url = "https://demo.loopfix.example/";

export const demoAfter: AuditRun = {
  requestedUrl: url,
  canonicalUrl: url,
  fetchedAt: "2026-08-28T20:05:00.000Z",
  rulesVersion: AUDIT_RULES_VERSION,
  findings: [
    createFinding("images_missing_alt", url, "1 image element is missing an alt attribute."),
    createFinding("missing_canonical", url, "No canonical link with a non-empty href was found."),
  ],
};
