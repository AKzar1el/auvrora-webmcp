import assert from "node:assert/strict";
import { describe, expect, it } from "vitest";
import type { AuditRun, Finding } from "../src/lib/audit/types.ts";
import { createAuvroraStore } from "../src/lib/app/state.ts";

function finding(id: string): Finding {
  const code = id.replace(/^finding:/, "");
  return {
    id,
    code,
    severity: "warning",
    title: code,
    affectedUrl: "https://example.org/",
    observedEvidence: "Evidence.",
    whyItMatters: "Reason.",
    recommendedAction: "Action.",
  };
}

function run(ids = ["finding:missing_title", "finding:missing_h1"]): AuditRun {
  return {
    requestedUrl: "https://example.org/",
    canonicalUrl: "https://example.org/",
    fetchedAt: "2026-08-28T20:00:00.000Z",
    rulesVersion: "2026-08-28.1",
    findings: ids.map(finding),
  };
}

describe("createAuvroraStore", () => {
  it("replaceAudit updates mode and clears stale scope and verification", () => {
    const store = createAuvroraStore();
    const first = run();
    store.replaceAudit(first, "live");
    store.setScope(["finding:missing_title"]);
    store.setVerification(run([]), [{ findingId: "finding:missing_title", status: "fixed" }]);

    const replacement = run(["finding:missing_h1"]);
    store.replaceAudit(replacement, "demo");
    expect(store.getState()).toEqual({
      mode: "demo",
      audit: replacement,
      selectedFindingIds: [],
      verification: null,
    });
  });

  it("setScope accepts one to ten unique current finding IDs", () => {
    const ids = Array.from({ length: 10 }, (_, index) => `finding:rule_${index}`);
    const store = createAuvroraStore();
    store.replaceAudit(run(ids), "live");
    store.setScope(ids);
    expect(store.getState().selectedFindingIds).toEqual(ids);
  });

  it("rejects empty, duplicate, oversized, and unknown scopes without partial mutation", () => {
    const store = createAuvroraStore();
    store.replaceAudit(run(), "live");
    store.setScope(["finding:missing_title"]);
    const before = store.getState();

    for (const invalid of [
      [],
      ["finding:missing_title", "finding:missing_title"],
      Array.from({ length: 11 }, (_, index) => `finding:${index}`),
      ["finding:not_current"],
    ]) {
      assert.throws(() => store.setScope(invalid));
      expect(store.getState()).toEqual(before);
    }
  });

  it("clearScope removes the last human selection without clearing the audit", () => {
    const store = createAuvroraStore();
    store.replaceAudit(run(), "live");
    store.setScope(["finding:missing_title"]);
    store.clearScope();
    expect(store.getState().audit?.canonicalUrl).toBe("https://example.org/");
    expect(store.getState().selectedFindingIds).toEqual([]);
    expect(store.getState().verification).toBe(null);
  });

  it("requires an active scope before storing verification", () => {
    const store = createAuvroraStore();
    store.replaceAudit(run(), "live");
    assert.throws(() => store.setVerification(run([]), []), /scope/i);
  });

  it("notifies subscribers with immutable snapshots once per mutation", () => {
    const store = createAuvroraStore();
    const snapshots: ReturnType<typeof store.getState>[] = [];
    const unsubscribe = store.subscribe((snapshot) => snapshots.push(snapshot));

    store.replaceAudit(run(), "live");
    store.setScope(["finding:missing_title"]);
    unsubscribe();
    store.reset();

    expect(snapshots).toHaveLength(2);
    assert.ok(Object.isFrozen(snapshots[0]));
    assert.ok(Object.isFrozen(snapshots[0].selectedFindingIds));
  });
});
