import type { FetchedPage } from "./fetch-public-page.ts";
import { createFinding, type FindingCode } from "./findings.ts";
import type { AuditRun, Finding } from "./types.ts";

export const AUDIT_RULES_VERSION = "2026-08-28.1";

const SEVERITY_RANK = { error: 0, warning: 1, notice: 2 } as const;

function stripIgnoredMarkup(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "");
}

function decodeMinimalEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#x([0-9a-f]+);/gi, (_match, digits: string) => {
      const codePoint = Number.parseInt(digits, 16);
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : "";
    })
    .replace(/&#(\d+);/g, (_match, digits: string) => {
      const codePoint = Number(digits);
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : "";
    });
}

function normalizeText(value: string | null | undefined): string {
  return decodeMinimalEntities(value ?? "").replace(/\s+/g, " ").trim();
}

function parseAttributes(tag: string): Map<string, string | null> {
  const attributes = new Map<string, string | null>();
  const body = tag.replace(/^<\/?\s*[\w:-]+/i, "").replace(/\/?\s*>$/, "");
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body))) {
    const name = match[1].toLowerCase();
    const rawValue = match[2] ?? match[3] ?? match[4] ?? null;
    attributes.set(name, rawValue === null ? null : decodeMinimalEntities(rawValue));
  }
  return attributes;
}

function isTagBoundary(character: string | undefined): boolean {
  return character === undefined || /[\t\n\f\r />]/.test(character);
}

function startTags(html: string, tag: string): string[] {
  const tags: string[] = [];
  const lowerHtml = html.toLowerCase();
  const needle = `<${tag.toLowerCase()}`;
  let cursor = 0;

  while (cursor < html.length) {
    const start = lowerHtml.indexOf(needle, cursor);
    if (start === -1) break;

    const afterName = html[start + needle.length];
    if (!isTagBoundary(afterName)) {
      cursor = start + needle.length;
      continue;
    }

    let quote: '"' | "'" | null = null;
    let end = start + needle.length;
    for (; end < html.length; end += 1) {
      const character = html[end];
      if (quote) {
        if (character === quote) quote = null;
        continue;
      }
      if (character === '"' || character === "'") {
        quote = character;
        continue;
      }
      if (character === ">") {
        tags.push(html.slice(start, end + 1));
        cursor = end + 1;
        break;
      }
    }

    if (end >= html.length) break;
  }

  return tags;
}

function extractTitle(html: string): string {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
  return normalizeText(match?.[1]);
}

function extractMetaContents(html: string, name: string): string[] {
  const contents: string[] = [];
  for (const tag of startTags(html, "meta")) {
    const attributes = parseAttributes(tag);
    if (normalizeText(attributes.get("name")).toLowerCase() !== name.toLowerCase()) continue;
    const content = normalizeText(attributes.get("content"));
    if (content) contents.push(content);
  }
  return contents;
}

function extractMetaContent(html: string, name: string): string {
  return extractMetaContents(html, name)[0] ?? "";
}

function countStartTags(html: string, tag: string): number {
  return startTags(html, tag).length;
}

function hasCanonical(html: string): boolean {
  for (const tag of startTags(html, "link")) {
    const attributes = parseAttributes(tag);
    const relTokens = normalizeText(attributes.get("rel")).toLowerCase().split(/\s+/).filter(Boolean);
    if (relTokens.includes("canonical") && normalizeText(attributes.get("href"))) return true;
  }
  return false;
}

function htmlLang(html: string): string {
  const tag = startTags(html, "html")[0];
  if (!tag) return "";
  return normalizeText(parseAttributes(tag).get("lang"));
}

function countImagesMissingAlt(html: string): number {
  return startTags(html, "img").reduce((count, tag) => {
    return count + (parseAttributes(tag).has("alt") ? 0 : 1);
  }, 0);
}

function add(findings: Finding[], code: FindingCode, url: string, evidence: string): void {
  findings.push(createFinding(code, url, evidence));
}

export function analyzePage(page: FetchedPage): AuditRun {
  const html = stripIgnoredMarkup(page.html);
  const findings: Finding[] = [];
  const title = extractTitle(html);
  const description = extractMetaContent(html, "description");
  const viewport = extractMetaContent(html, "viewport");
  const robots = extractMetaContents(html, "robots")
    .flatMap((content) => content.split(/[\s,]+/))
    .map((token) => token.toLowerCase())
    .filter(Boolean);
  const h1Count = countStartTags(html, "h1");
  const missingAltCount = countImagesMissingAlt(html);

  if (!title) add(findings, "missing_title", page.canonicalUrl, "No non-empty <title> element was found.");
  else if (title.length < 30) add(findings, "title_too_short", page.canonicalUrl, `Title length: ${title.length} characters.`);
  else if (title.length > 60) add(findings, "title_too_long", page.canonicalUrl, `Title length: ${title.length} characters.`);

  if (!description) add(findings, "missing_meta_description", page.canonicalUrl, "No non-empty meta description was found.");
  else if (description.length < 70) add(findings, "meta_description_too_short", page.canonicalUrl, `Meta description length: ${description.length} characters.`);
  else if (description.length > 160) add(findings, "meta_description_too_long", page.canonicalUrl, `Meta description length: ${description.length} characters.`);

  if (h1Count === 0) add(findings, "missing_h1", page.canonicalUrl, "No <h1> element was found.");
  else if (h1Count > 1) add(findings, "multiple_h1", page.canonicalUrl, `${h1Count} <h1> elements were found.`);

  if (!hasCanonical(html)) add(findings, "missing_canonical", page.canonicalUrl, "No canonical link with a non-empty href was found.");
  if (!viewport) add(findings, "missing_viewport", page.canonicalUrl, "No non-empty viewport meta tag was found.");
  if (!htmlLang(html)) add(findings, "missing_lang", page.canonicalUrl, "The <html> element has no non-empty lang attribute.");
  if (missingAltCount > 0) {
    add(
      findings,
      "images_missing_alt",
      page.canonicalUrl,
      `${missingAltCount} image element${missingAltCount === 1 ? " is" : "s are"} missing an alt attribute.`,
    );
  }
  if (robots.some((token) => token === "noindex" || token === "none")) {
    add(findings, "noindex_detected", page.canonicalUrl, "Robots meta includes a noindex directive.");
  }

  findings.sort((left, right) => SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity] || left.code.localeCompare(right.code));

  return {
    requestedUrl: page.requestedUrl,
    canonicalUrl: page.canonicalUrl,
    fetchedAt: page.fetchedAt,
    rulesVersion: AUDIT_RULES_VERSION,
    findings,
  };
}
