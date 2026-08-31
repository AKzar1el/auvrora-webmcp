import { describe, expect, it } from "vitest";
import { analyzePage } from "../src/lib/audit/analyze-page.ts";
import type { FetchedPage } from "../src/lib/audit/fetch-public-page.ts";

function audit(body: string) {
  const page: FetchedPage = {
    requestedUrl: "https://example.org/",
    canonicalUrl: "https://example.org/",
    fetchedAt: "2026-08-29T00:00:00.000Z",
    html: `<!doctype html><html lang="en"><head>
      <title>A descriptive example page title for testing</title>
      <meta name="description" content="A > B, and this description deliberately contains enough useful text to remain inside the Auvrora heuristic range for this parser regression.">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="canonical" href="https://example.org/">
    </head><body><h1>Example</h1>${body}</body></html>`,
  };
  return analyzePage(page).findings.map((finding) => finding.code);
}

describe("quoted attribute parsing", () => {
  it("does not terminate a meta tag at greater-than text inside quotes", () => {
    expect(audit("")).not.toContain("missing_meta_description");
  });

  it("still sees alt attributes after greater-than text inside an earlier quoted attribute", () => {
    expect(audit('<img title="1 > 0" src="example.png" alt="Example">')).not.toContain("images_missing_alt");
  });
});
