import type { AuditRun } from "../audit/types.ts";

export type VerificationStatus = "fixed" | "still_present" | "not_verifiable";

export type VerificationResult = {
  findingId: string;
  status: VerificationStatus;
};

export function compareSelectedFindings(
  selectedIds: string[],
  before: AuditRun,
  after: AuditRun,
): VerificationResult[] {
  const beforeIds = new Set(before.findings.map((finding) => finding.id));
  const afterIds = new Set(after.findings.map((finding) => finding.id));

  return selectedIds.map((findingId) => {
    if (!beforeIds.has(findingId)) {
      return { findingId, status: "not_verifiable" as const };
    }
    return {
      findingId,
      status: afterIds.has(findingId) ? "still_present" as const : "fixed" as const,
    };
  });
}
