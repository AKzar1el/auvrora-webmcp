import assert from "node:assert/strict";
import { describe, expect, it } from "vitest";
import type { AuditRun, Finding } from "../src/lib/audit/types.ts";
import { createLoopFixController } from "../src/lib/app/controller.ts";
import { createAuditClient } from "../src/lib/app/audit-client.ts";
import { demoBefore } from "../src/demo/before.ts";

function finding(id: string, severity: "error" | "warning" | "notice" = "warning"): Finding {
  const code = id.replace(/^finding:/, "");
  return {
    id,
    code,
    severity,
    title: code,
    affectedUrl: "https://example.org/",
    observedEvidence: "Evidence.",
    whyItMatters: "Reason.",
    recommendedAction: "Action.",
  };
}

function run(ids = ["finding:missing_title"]): AuditRun {
  return {
    requestedUrl: "https://example.org/start",
    canonicalUrl: "https://example.org/final",
    fetchedAt: "2026-08-28T20:00:00.000Z",
    rulesVersion: "2026-08-28.1",
    findings: ids.map((id, index) => finding(id, index === 0 ? "error" : "warning")),
  };
}

describe("audit client", () => {
  it("posts same-origin JSON, forwards AbortSignal, and validates a successful run", async () => {
    const controller = new AbortController();
    let observed: RequestInit | undefined;
    const client = createAuditClient(async (_input, init) => {
      observed = init;
      return new Response(JSON.stringify(run()), { headers: { "content-type": "application/json" } });
    });
    const result = await client("https://example.org/start", controller.signal);
    expect(result.canonicalUrl).toBe("https://example.org/final");
    expect(observed?.method).toBe("POST");
    expect(observed?.signal).toBe(controller.signal);
    expect(observed?.credentials).toBe(undefined);
    expect(observed?.body).toBe(JSON.stringify({ url: "https://example.org/start" }));
  });

  it("rejects malformed successful payloads", async () => {
    const client = createAuditClient(async () => new Response(JSON.stringify({ canonicalUrl: "https://example.org/" })));
    await assert.rejects(() => client("https://example.org/"), /invalid audit response/i);
  });

  it("surfaces stable server errors without leaking arbitrary objects", async () => {
    const client = createAuditClient(async () => new Response(JSON.stringify({ error: "private_url", message: "That target is not public." }), { status: 400 }));
    await assert.rejects(() => client("http://127.0.0.1/"), (error: unknown) => {
      if (!(error instanceof Error)) return false;
      assert.equal(error.message, "That target is not public.");
      return true;
    });
  });
});

describe("LoopFix controller", () => {
  it("runAudit forwards signal and commits only after success", async () => {
    const signalController = new AbortController();
    let observedSignal: AbortSignal | undefined;
    const next = run(["finding:missing_title", "finding:missing_h1"]);
    const controller = createLoopFixController({
      auditClient: async (_url, signal) => { observedSignal = signal; return next; },
    });
    const result = await controller.runAudit("https://example.org/", signalController.signal);
    expect(result).toEqual(next);
    expect(observedSignal).toBe(signalController.signal);
    expect(controller.getState().audit?.canonicalUrl).toBe(next.canonicalUrl);
    expect(controller.getState().mode).toBe("live");
  });

  it("failed new audit leaves previous successful state intact", async () => {
    let calls = 0;
    const controller = createLoopFixController({
      auditClient: async () => {
        calls += 1;
        if (calls === 1) return run();
        throw new Error("network failed");
      },
    });
    await controller.runAudit("https://example.org/");
    const before = controller.getState();
    await assert.rejects(() => controller.runAudit("https://other.example.org/"), /network failed/);
    expect(controller.getState()).toEqual(before);
  });

  it("loadDemo replaces prior live state", async () => {
    const controller = createLoopFixController({ auditClient: async () => run() });
    await controller.runAudit("https://example.org/");
    controller.setFixScope(["finding:missing_title"]);
    controller.loadDemo();
    expect(controller.getState().mode).toBe("demo");
    expect(controller.getState().audit?.canonicalUrl).toBe(demoBefore.canonicalUrl);
    expect(controller.getState().selectedFindingIds).toEqual([]);
  });

  it("lists findings deterministically with severity filtering and a hard cap of ten", () => {
    const ids = Array.from({ length: 12 }, (_, index) => `finding:rule_${index}`);
    const custom = run(ids);
    custom.findings = ids.map((id, index) => finding(id, index % 2 ? "warning" : "error"));
    const controller = createLoopFixController({ demoBeforeRun: custom });
    controller.loadDemo();
    expect(controller.listFindings().length).toBe(10);
    expect(controller.listFindings({ severity: "warning", limit: 3 }).map((item) => item.severity)).toEqual(["warning", "warning", "warning"]);
  });

  it("inspection rejects unknown finding IDs", () => {
    const controller = createLoopFixController();
    controller.loadDemo();
    assert.throws(() => controller.inspectFinding("finding:not_here"), /not found/i);
  });

  it("lets the human workflow clear the visible scope without exposing an empty WebMCP scope", () => {
    const controller = createLoopFixController();
    controller.loadDemo();
    controller.setFixScope(["finding:missing_title"]);
    controller.clearFixScope();
    expect(controller.getState().selectedFindingIds).toEqual([]);
  });

  it("demo verification uses the deterministic after fixture", async () => {
    const controller = createLoopFixController();
    controller.loadDemo();
    controller.setFixScope(["finding:missing_title", "finding:images_missing_alt"]);
    expect(await controller.verifyFixScope()).toEqual([
      { findingId: "finding:missing_title", status: "fixed" },
      { findingId: "finding:images_missing_alt", status: "still_present" },
    ]);
  });

  it("live verification reuses the active canonical URL and forwards the signal", async () => {
    const first = run(["finding:missing_title"]);
    const second = { ...run([]), requestedUrl: first.canonicalUrl, canonicalUrl: first.canonicalUrl };
    const calls: Array<{ url: string; signal?: AbortSignal }> = [];
    const controller = createLoopFixController({
      auditClient: async (url, signal) => {
        calls.push({ url, signal });
        return calls.length === 1 ? first : second;
      },
    });
    await controller.runAudit("https://example.org/start");
    controller.setFixScope(["finding:missing_title"]);
    const abort = new AbortController();
    await controller.verifyFixScope(abort.signal);
    expect(calls[1].url).toBe("https://example.org/final");
    expect(calls[1].signal).toBe(abort.signal);
  });
});
