import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function read(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("public challenge documentation", () => {
  it("documents the five tools, local verification, Chrome testing, and MIT license from the README first screen", async () => {
    const readme = await read("README.md");
    for (const value of [
      "Auvrora WebMCP",
      "run_audit",
      "list_findings",
      "inspect_finding",
      "set_fix_scope",
      "verify_fix_scope",
      "npm run verify",
      "chrome://flags/#enable-webmcp-testing",
      "MIT",
    ]) expect(readme.includes(value)).toBeTruthy();
    expect(readme.includes("ChatGPT")).toBeTruthy();
  });

  it("keeps CI read-only and verifies check, test, and build with npm ci", async () => {
    const ci = await read(".github/workflows/ci.yml");
    expect(ci.includes("contents: read")).toBeTruthy();
    expect(ci.includes("npm ci")).toBeTruthy();
    expect(ci.includes("npm run check")).toBeTruthy();
    expect(ci.includes("npm test")).toBeTruthy();
    expect(ci.includes("npm run build")).toBeTruthy();
  });

  it("publishes architecture, security boundaries, and challenge provenance", async () => {
    const architecture = await read("docs/architecture.md");
    const security = await read("docs/security.md");
    const scope = await read("docs/challenge-scope.md");
    expect(architecture.includes("sequenceDiagram")).toBeTruthy();
    expect(security.includes("DNS rebinding")).toBeTruthy();
    expect(security.includes("untrustedContentHint")).toBeTruthy();
    expect(security.includes("2 MiB")).toBeTruthy();
    expect(scope.includes("new standalone challenge artifact")).toBeTruthy();
    expect(scope.includes("DigestSEO")).toBeTruthy();
  });
});
