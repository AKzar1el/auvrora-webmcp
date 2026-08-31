import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Auvrora page metadata", () => {
  it("keeps the page title within its own documented heuristic", async () => {
    const source = await readFile(new URL("../src/pages/index.astro", import.meta.url), "utf8");
    const title = /<title>([^<]+)<\/title>/.exec(source)?.[1]?.trim() ?? "";
    expect(title.length).toBeGreaterThanOrEqual(30);
    expect(title.length).toBeLessThanOrEqual(60);
  });

  it("publishes a canonical link for the challenge page", async () => {
    const source = await readFile(new URL("../src/pages/index.astro", import.meta.url), "utf8");
    expect(source).toMatch(/<link\s+rel="canonical"\s+href=\{canonicalUrl\}\s*\/?>/);
  });
});
