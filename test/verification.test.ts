import { describe, expect, it } from "vitest";
import type { AuditRun, Finding } from "../src/lib/audit/types.ts";
import { compareSelectedFindings } from "../src/lib/app/verification.ts";

function finding(id: string): Finding {
  const code = id.replace(/^finding:/, "");
  return {
    id,
    code,
    severity: "warning",
    title: code,
    affectedUrl: "https://example.org/",
    observedEvidence: "Generated evidence.",
    whyItMatters: "Reason.",
    recommendedAction: "Action.",
  };
}

function run(ids: string[]): AuditRun {
  return {
    requestedUrl: "https://example.org/",
    canonicalUrl: "https://example.org/",
    fetchedAt: "2026-08-28T20:00:00.000Z",
    rulesVersion: "2026-08-28.1",
    findings: ids.map(finding),
  };
}

describe("compareSelectedFindings", () => {
  it("marks an absent selected finding as fixed", () => {
    const before = run(["finding:missing_title"]);
    const after = run([]);
    expect(compareSelectedFindings(["finding:missing_title"], before, after)).toEqual([
      { findingId: "finding:missing_title", status: "fixed" },
    ]);
  });

  it("marks a finding present in both runs as still present", () => {
    const before = run(["finding:missing_title"]);
    const after = run(["finding:missing_title"]);
    expect(compareSelectedFindings(["finding:missing_title"], before, after)).toEqual([
      { findingId: "finding:missing_title", status: "still_present" },
    ]);
  });

  it("preserves selection order", () => {
    const before = run(["finding:missing_title", "finding:missing_h1"]);
    const after = run(["finding:missing_h1"]);
    expect(compareSelectedFindings(
      ["finding:missing_h1", "finding:missing_title"],
      before,
      after,
    )).toEqual([
      { findingId: "finding:missing_h1", status: "still_present" },
      { findingId: "finding:missing_title", status: "fixed" },
    ]);
  });
});
