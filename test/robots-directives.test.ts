import { describe, expect, it } from "vitest";
import { analyzePage } from "../src/lib/audit/analyze-page.ts";
import type { FetchedPage } from "../src/lib/audit/fetch-public-page.ts";

function findings(extraMeta: string) {
  const page: FetchedPage = {
    requestedUrl: "https://example.org/",
    canonicalUrl: "https://example.org/",
    fetchedAt: "2026-08-29T00:00:00.000Z",
    html: `<!doctype html><html lang="en"><head>
      <title>A descriptive example page title for robots testing</title>
      <meta name="description" content="A sufficiently detailed description for a deterministic LoopFix robots directive regression test without unrelated findings.">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="canonical" href="https://example.org/">
      ${extraMeta}
    </head><body><h1>Example</h1></body></html>`,
  };
  return analyzePage(page).findings.map((finding) => finding.code);
}

describe("robots noindex detection", () => {
  it("treats the standard none directive as noindex", () => {
    expect(findings('<meta name="robots" content="none">')).toContain("noindex_detected");
  });

  it("combines multiple robots meta tags instead of inspecting only the first", () => {
    expect(findings('<meta name="robots" content="follow"><meta name="robots" content="noindex">')).toContain("noindex_detected");
  });
});
