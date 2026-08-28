import type { Finding, Severity } from "./types.ts";

export type FindingRule = {
  severity: Severity;
  title: string;
  whyItMatters: string;
  recommendedAction: string;
};

export const FINDING_RULES = Object.freeze({
  missing_title: {
    severity: "error",
    title: "Missing page title",
    whyItMatters: "A descriptive title helps users and search systems understand the page's primary topic.",
    recommendedAction: "Add one concise, descriptive <title> element that accurately names this page.",
  },
  title_too_short: {
    severity: "warning",
    title: "Page title is very short",
    whyItMatters: "Very short titles often provide too little context to distinguish a page in search or browser interfaces.",
    recommendedAction: "Review the title and add page-specific context if it can be more descriptive without becoming verbose.",
  },
  title_too_long: {
    severity: "warning",
    title: "Page title is long",
    whyItMatters: "Long titles may be truncated in search interfaces and can become harder for users to scan.",
    recommendedAction: "Review the title for unnecessary boilerplate and keep the most descriptive terms concise.",
  },
  missing_meta_description: {
    severity: "error",
    title: "Missing meta description",
    whyItMatters: "A useful meta description can help search systems form an informative snippet when it better describes the page.",
    recommendedAction: "Add a unique, human-readable meta description that summarizes this page accurately.",
  },
  meta_description_too_short: {
    severity: "warning",
    title: "Meta description is very short",
    whyItMatters: "A very short description may not provide enough context to summarize the page for users.",
    recommendedAction: "Review the description and add relevant page-specific context where useful.",
  },
  meta_description_too_long: {
    severity: "warning",
    title: "Meta description is long",
    whyItMatters: "Search interfaces may truncate descriptions to fit the available device width.",
    recommendedAction: "Keep the most useful page-specific information early and remove unnecessary repetition.",
  },
  missing_h1: {
    severity: "error",
    title: "Missing H1 heading",
    whyItMatters: "A clear primary heading helps users understand the page and gives its visible content a strong structure.",
    recommendedAction: "Add a clear primary H1 that describes the page's main content.",
  },
  multiple_h1: {
    severity: "warning",
    title: "Multiple H1 headings",
    whyItMatters: "Multiple primary headings can make the page's visual hierarchy less clear when they compete for the same role.",
    recommendedAction: "Review heading structure and keep one clearly dominant page heading where that matches the design.",
  },
  missing_canonical: {
    severity: "notice",
    title: "No canonical link",
    whyItMatters: "A canonical link can clarify the preferred URL when equivalent or near-duplicate URLs are available.",
    recommendedAction: "If duplicate URL variants are possible, add a valid canonical link to the preferred public URL.",
  },
  missing_viewport: {
    severity: "notice",
    title: "Missing viewport metadata",
    whyItMatters: "Viewport metadata helps mobile browsers size and render responsive layouts as intended.",
    recommendedAction: "Add a viewport meta tag appropriate for the responsive layout, commonly width=device-width, initial-scale=1.",
  },
  missing_lang: {
    severity: "notice",
    title: "Missing document language",
    whyItMatters: "Declaring the document language helps assistive technology and user agents interpret text correctly.",
    recommendedAction: "Add a valid lang attribute to the root html element for the page's primary language.",
  },
  images_missing_alt: {
    severity: "warning",
    title: "Images missing alt attributes",
    whyItMatters: "Images without alt attributes can create accessibility gaps and leave non-visual users without an equivalent description or decorative marker.",
    recommendedAction: "Add meaningful alt text for informative images and an empty alt attribute for images that are purely decorative.",
  },
  noindex_detected: {
    severity: "warning",
    title: "Noindex directive detected",
    whyItMatters: "A noindex directive asks supporting search engines not to show this page in search results.",
    recommendedAction: "Confirm noindex is intentional; remove it only if this page is meant to be eligible for indexing.",
  },
} satisfies Record<string, FindingRule>);

export type FindingCode = keyof typeof FINDING_RULES;

export function createFinding(code: FindingCode, affectedUrl: string, observedEvidence: string): Finding {
  const rule = FINDING_RULES[code];
  return {
    id: `finding:${code}`,
    code,
    severity: rule.severity,
    title: rule.title,
    affectedUrl,
    observedEvidence: observedEvidence.slice(0, 240),
    whyItMatters: rule.whyItMatters,
    recommendedAction: rule.recommendedAction,
  };
}
