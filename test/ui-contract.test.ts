import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("human UI source contract", () => {
  it("keeps the stable accessible hooks required by the shared workflow", async () => {
    const combined = [
      await source("src/components/AuditForm.astro"),
      await source("src/components/FindingsPanel.astro"),
      await source("src/components/FixScopePanel.astro"),
      await source("src/components/VerificationPanel.astro"),
      await source("src/pages/index.astro"),
    ].join("\n");

    for (const id of [
      "loopfix-audit-form",
      "loopfix-url",
      "loopfix-run",
      "loopfix-demo",
      "webmcp-status",
      "findings-panel",
      "fix-scope-panel",
      "verification-panel",
      "app-live-region",
    ]) {
      expect(combined.includes(`id=\"${id}\"`)).toBeTruthy();
    }
    expect(combined.includes("<main")).toBeTruthy();
    expect(combined.includes("aria-live=\"polite\"")).toBeTruthy();
    expect(combined.includes("<label for=\"loopfix-url\"")).toBeTruthy();
  });

  it("surfaces not-verifiable verification outcomes in human-facing summaries", async () => {
    const client = await source("src/scripts/loopfix-client.ts");
    expect(client.includes("notVerifiable")).toBeTruthy();
    expect(client.includes("not verifiable")).toBeTruthy();
  });

  it("renders remote-derived data without innerHTML", async () => {
    const client = await source("src/scripts/loopfix-client.ts");
    expect(client.includes("innerHTML")).toBeFalsy();
    expect(client.includes("textContent")).toBeTruthy();
    expect(client.includes("createElement")).toBeTruthy();
  });
});

describe("WebMCP UI integration source contract", () => {
  it("registers tools after controller creation and keeps unsupported browsers usable", async () => {
    const client = await source("src/scripts/loopfix-client.ts");
    expect(client.includes("registerLoopFixTools")).toBeTruthy();
    expect(client.includes("WebMCP ready ·")).toBeTruthy();
    expect(client.includes("WebMCP unavailable in this browser")).toBeTruthy();
    expect(client.includes("WebMCP registration failed")).toBeTruthy();
  });
});
