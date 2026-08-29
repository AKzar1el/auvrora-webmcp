import { describe, expect, it } from "vitest";
import { createLoopFixController } from "../src/lib/app/controller.ts";
import type { AuditRun, Finding } from "../src/lib/audit/types.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function finding(id = "finding:missing_title"): Finding {
  return {
    id,
    code: id.replace(/^finding:/, ""),
    severity: "error",
    title: "Missing page title",
    affectedUrl: "https://example.org/",
    observedEvidence: "No title.",
    whyItMatters: "Reason.",
    recommendedAction: "Action.",
  };
}

function run(canonicalUrl: string, ids = ["finding:missing_title"]): AuditRun {
  return {
    requestedUrl: canonicalUrl,
    canonicalUrl,
    fetchedAt: "2026-08-29T00:00:00.000Z",
    rulesVersion: "2026-08-28.1",
    findings: ids.map(finding),
  };
}

describe("controller async state safety", () => {
  it("does not let an older audit response replace a newer requested audit", async () => {
    const first = deferred<AuditRun>();
    const second = deferred<AuditRun>();
    const controller = createLoopFixController({
      auditClient: (url) => url.endsWith("/first") ? first.promise : second.promise,
    });

    const firstCall = controller.runAudit("https://example.org/first");
    const secondCall = controller.runAudit("https://example.org/second");

    first.resolve(run("https://example.org/first"));
    await expect(firstCall).rejects.toThrow(/newer|supersed/i);
    expect(controller.getState().audit).toBeNull();

    second.resolve(run("https://example.org/second"));
    await expect(secondCall).resolves.toMatchObject({ canonicalUrl: "https://example.org/second" });
    expect(controller.getState().audit?.canonicalUrl).toBe("https://example.org/second");
  });

  it("does not attach stale verification to a different active audit with the same finding IDs", async () => {
    const verificationFetch = deferred<AuditRun>();
    let call = 0;
    const controller = createLoopFixController({
      auditClient: async () => {
        call += 1;
        if (call === 1) return run("https://example.org/first");
        if (call === 2) return verificationFetch.promise;
        return run("https://example.org/second");
      },
    });

    await controller.runAudit("https://example.org/first");
    controller.setFixScope(["finding:missing_title"]);
    const verification = controller.verifyFixScope();

    await controller.runAudit("https://example.org/second");
    controller.setFixScope(["finding:missing_title"]);
    verificationFetch.resolve(run("https://example.org/first", []));

    await expect(verification).rejects.toThrow(/changed|newer|stale/i);
    expect(controller.getState().audit?.canonicalUrl).toBe("https://example.org/second");
    expect(controller.getState().verification).toBeNull();
  });

  it("invalidates verification as soon as a replacement audit is requested", async () => {
    const verificationFetch = deferred<AuditRun>();
    const replacementFetch = deferred<AuditRun>();
    let call = 0;
    const controller = createLoopFixController({
      auditClient: async () => {
        call += 1;
        if (call === 1) return run("https://example.org/first");
        if (call === 2) return verificationFetch.promise;
        return replacementFetch.promise;
      },
    });

    await controller.runAudit("https://example.org/first");
    controller.setFixScope(["finding:missing_title"]);
    const verification = controller.verifyFixScope();
    const replacement = controller.runAudit("https://example.org/second");

    verificationFetch.resolve(run("https://example.org/first", []));
    await expect(verification).rejects.toThrow(/changed|newer|stale|supersed/i);
    expect(controller.getState().verification).toBeNull();

    replacementFetch.resolve(run("https://example.org/second"));
    await expect(replacement).resolves.toMatchObject({ canonicalUrl: "https://example.org/second" });
  });
});
