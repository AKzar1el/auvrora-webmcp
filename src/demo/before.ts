import { createFinding } from "../lib/audit/findings.ts";
import type { AuditRun } from "../lib/audit/types.ts";
import { AUDIT_RULES_VERSION } from "../lib/audit/analyze-page.ts";

const url = "https://demo.loopfix.example/";

export const demoBefore: AuditRun = {
  requestedUrl: url,
  canonicalUrl: url,
  fetchedAt: "2026-08-28T20:00:00.000Z",
  rulesVersion: AUDIT_RULES_VERSION,
  findings: [
    createFinding("missing_title", url, "No non-empty <title> element was found."),
    createFinding("missing_meta_description", url, "No non-empty meta description was found."),
    createFinding("missing_h1", url, "No H1 heading was found."),
    createFinding("images_missing_alt", url, "2 image elements are missing an alt attribute."),
    createFinding("missing_canonical", url, "No canonical link with a non-empty href was found."),
  ],
};
