import { describe, expect, it } from "vitest";
import { analyzePage } from "../src/lib/audit/analyze-page.ts";
import type { FetchedPage } from "../src/lib/audit/fetch-public-page.ts";

function page(html: string): FetchedPage {
  return {
    requestedUrl: "https://example.org/",
    canonicalUrl: "https://example.org/",
    fetchedAt: "2026-08-29T00:00:00.000Z",
    html,
  };
}

describe("HTML text normalization", () => {
  it("measures hexadecimal numeric character references as rendered characters", () => {
    const title = "&#x41;".repeat(30);
    const html = `<!doctype html>
      <html lang="en"><head>
        <title>${title}</title>
        <meta name="description" content="A sufficiently detailed description that passes the Auvrora heuristic without claiming a search-engine requirement.">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="canonical" href="https://example.org/">
      </head><body><h1>Example</h1></body></html>`;

    const codes = analyzePage(page(html)).findings.map((finding) => finding.code);
    expect(codes).not.toContain("title_too_short");
    expect(codes).not.toContain("title_too_long");
  });
});
