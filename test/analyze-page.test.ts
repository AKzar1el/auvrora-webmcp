import { describe, expect, it } from "vitest";
import { analyzePage, AUDIT_RULES_VERSION } from "../src/lib/audit/analyze-page.ts";
import type { FetchedPage } from "../src/lib/audit/fetch-public-page.ts";

function page(html: string): FetchedPage {
  return {
    requestedUrl: "https://example.org/",
    canonicalUrl: "https://example.org/",
    fetchedAt: "2026-08-28T20:00:00.000Z",
    html,
  };
}

function codes(html: string): string[] {
  return analyzePage(page(html)).findings.map((finding) => finding.code);
}

const CLEAN_HTML = `<!doctype html>
<html lang="en">
  <head>
    <title>A sufficiently descriptive page title for testing</title>
    <meta name="description" content="A sufficiently detailed description that passes the LoopFix heuristic without claiming to be a search-engine requirement.">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="canonical" href="https://example.org/">
  </head>
  <body><h1>Example</h1><img src="x.png" alt="Example"></body>
</html>`;

describe("analyzePage", () => {
  it("preserves run identity and rule version", () => {
    const result = analyzePage(page(CLEAN_HTML));
    expect(result.requestedUrl).toBe("https://example.org/");
    expect(result.canonicalUrl).toBe("https://example.org/");
    expect(result.fetchedAt).toBe("2026-08-28T20:00:00.000Z");
    expect(result.rulesVersion).toBe(AUDIT_RULES_VERSION);
  });

  it("returns no findings for the documented clean baseline", () => {
    expect(analyzePage(page(CLEAN_HTML)).findings.length).toBe(0);
  });

  it("detects missing title, description, h1, canonical, viewport, and lang", () => {
    const result = codes("<html><head></head><body><p>x</p></body></html>");
    for (const code of [
      "missing_title",
      "missing_meta_description",
      "missing_h1",
      "missing_canonical",
      "missing_viewport",
      "missing_lang",
    ]) expect(result).toContain(code);
  });

  it("detects short and long titles using normalized text length", () => {
    expect(codes(CLEAN_HTML.replace("A sufficiently descriptive page title for testing", "Short title"))).toContain("title_too_short");
    expect(codes(CLEAN_HTML.replace("A sufficiently descriptive page title for testing", "T".repeat(61)))).toContain("title_too_long");
  });

  it("detects short and long meta descriptions", () => {
    const shortHtml = CLEAN_HTML.replace(/A sufficiently detailed description[^\"]+/, "Too short");
    expect(codes(shortHtml)).toContain("meta_description_too_short");
    const longHtml = CLEAN_HTML.replace(/A sufficiently detailed description[^\"]+/, "D".repeat(161));
    expect(codes(longHtml)).toContain("meta_description_too_long");
  });

  it("detects multiple h1 elements", () => {
    expect(codes(CLEAN_HTML.replace("</h1>", "</h1><h1>Second</h1>"))).toContain("multiple_h1");
  });

  it("requires a usable canonical link", () => {
    expect(codes(CLEAN_HTML.replace('<link rel="canonical" href="https://example.org/">', '<link rel="stylesheet" href="/x.css">'))).toContain("missing_canonical");
  });

  it("requires a non-empty viewport meta", () => {
    expect(codes(CLEAN_HTML.replace('content="width=device-width, initial-scale=1"', 'content=""'))).toContain("missing_viewport");
  });

  it("requires a non-empty html lang attribute", () => {
    expect(codes(CLEAN_HTML.replace('lang="en"', 'lang=""'))).toContain("missing_lang");
  });

  it("counts images that lack an alt attribute without treating empty alt as missing", () => {
    const html = CLEAN_HTML.replace(
      '<img src="x.png" alt="Example">',
      '<img src="a.png"><img src="b.png"><img src="decorative.png" alt="">',
    );
    const finding = analyzePage(page(html)).findings.find((item) => item.code === "images_missing_alt");
    expect(finding?.observedEvidence).toBe("2 image elements are missing an alt attribute.");
  });

  it("detects noindex in a robots meta tag case-insensitively", () => {
    const html = CLEAN_HTML.replace("</head>", '<meta NAME="robots" content="index, NOINDEX, follow"></head>');
    expect(codes(html)).toContain("noindex_detected");
  });

  it("ignores markup-looking text inside scripts, styles, and comments", () => {
    const html = `<html lang="en"><head>
      <script>const fake = '<title>Fake title with enough characters</title><meta name="description" content="${"x".repeat(100)}">';</script>
      <style>/* <link rel="canonical" href="https://example.org/"> */</style>
    </head><body><!-- <h1>Fake</h1> --></body></html>`;
    const result = codes(html);
    expect(result).toContain("missing_title");
    expect(result).toContain("missing_meta_description");
    expect(result).toContain("missing_h1");
    expect(result).toContain("missing_canonical");
  });

  it("uses stable IDs, bounded generated evidence, and deterministic severity ordering", () => {
    const html = "<html><head></head><body><img src='a.png'></body></html>";
    const findings = analyzePage(page(html)).findings;
    for (const finding of findings) {
      expect(finding.id).toBe(`finding:${finding.code}`);
      expect(finding.observedEvidence.length <= 240).toBe(true);
      expect(finding.affectedUrl).toBe("https://example.org/");
    }
    const rank = { error: 0, warning: 1, notice: 2 } as const;
    const sorted = [...findings].sort((a, b) => rank[a.severity] - rank[b.severity] || a.code.localeCompare(b.code));
    expect(findings.map((item) => item.code)).toEqual(sorted.map((item) => item.code));
  });
});
