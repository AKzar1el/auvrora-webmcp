# LoopFix WebMCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a small, production-grade, open-source WebMCP application that audits one public webpage, exposes exactly five native WebMCP tools, lets a human and agent select a bounded fix scope, and verifies that scope with a fresh deterministic audit.

**Architecture:** Astro runs on Cloudflare Workers with one stateless `/api/audit` endpoint and a small browser application. The server performs URL-policy enforcement, bounded fetching, deterministic HTML checks, and coarse abuse protection; the browser owns ephemeral session state shared by human controls and WebMCP handlers. Native `document.modelContext.registerTool(...)` is used directly with no WebMCP runtime wrapper.

**Tech Stack:** Astro, TypeScript, `@astrojs/cloudflare`, Cloudflare Workers, Wrangler, Vitest, native WebMCP, `webmcp-types` as a dev-only type dependency, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-28-loopfix-webmcp-design.md`

## Global Constraints

- Product name in UI/docs/package metadata: `LoopFix WebMCP`; GitHub repository remains `AKzar1el/loopfix-mcp`.
- Deployment target: Cloudflare Workers, not a newly created Pages application.
- WebMCP API: use `document.modelContext`; do not use deprecated `navigator.modelContext`.
- Expose exactly five tools: `run_audit`, `list_findings`, `inspect_finding`, `set_fix_scope`, `verify_fix_scope`.
- Do not add `exposedTo` cross-origin origins.
- External page-derived data exposed by tools must carry `untrustedContentHint: true`.
- Read-only tools must carry `readOnlyHint: true`.
- All JSON Schemas use `additionalProperties: false`.
- No auth, database, billing, analytics SDK, remote MCP server, LLM API, arbitrary request headers, cookies, credentials, nonstandard target ports, or write access to external systems.
- Request body cap: 4 KiB.
- URL cap: 2,048 characters.
- Target protocols: `http:` and `https:` only.
- Target ports: default 80/443 only.
- Redirect cap: 3; every destination is revalidated.
- Network timeout: 12 seconds per fetch.
- HTML body cap: 2 MiB.
- Accepted response types: `text/html` and `application/xhtml+xml`.
- Tool list output cap: at most 10 findings; individual agent-facing results should target roughly <= 1.5K characters.
- No remote HTML is executed or injected as active markup.
- Demo mode is explicitly labeled and uses committed deterministic fixtures.
- Verification reuses the active canonical URL; it never accepts a replacement URL argument.
- Initial production rate target: 10 audit starts per minute per derived anonymous abuse-control key.
- Implementation order is TDD-first: failing focused test, minimal implementation, passing focused test, refactor only if needed, then commit.
- Do not broaden the initial deterministic rule set beyond the 13 rules in the approved spec during this plan.

---

## File Map

The implementation should converge on these responsibilities. Small adjacent files may be combined only when that reduces indirection without mixing responsibilities.

- `package.json` — scripts and dependency declaration.
- `package-lock.json` — exact dependency lock.
- `astro.config.mjs` — Astro + Cloudflare adapter configuration.
- `tsconfig.json` — strict Astro TypeScript + `webmcp-types`.
- `wrangler.jsonc` — Worker entry, assets, compatibility date, rate-limit binding, observability.
- `public/.assetsignore` — prevents Worker internals being copied into public assets.
- `src/lib/audit/types.ts` — audit/finding/error domain types only.
- `src/lib/audit/url-policy.ts` — URL parsing and literal host/port/private-range rejection.
- `src/lib/audit/fetch-public-page.ts` — bounded GET, redirect validation, timeout, content-type, streaming byte limit.
- `src/lib/audit/findings.ts` — immutable rule metadata and finding factory.
- `src/lib/audit/analyze-page.ts` — deterministic source inspection for the 13 approved rules.
- `src/lib/app/state.ts` — ephemeral shared state store and validated mutations.
- `src/lib/app/verification.ts` — selected-code comparison.
- `src/lib/app/audit-client.ts` — browser `/api/audit` client with AbortSignal propagation and typed errors.
- `src/lib/app/controller.ts` — shared application service used by both UI and WebMCP handlers.
- `src/lib/webmcp/schemas.ts` — frozen input schemas and tool metadata.
- `src/lib/webmcp/tools.ts` — tool definitions bound to the application service.
- `src/lib/webmcp/register.ts` — feature detection, registration lifecycle, unregister cleanup.
- `src/demo/before.ts` / `src/demo/after.ts` — deterministic challenge fixtures.
- `src/pages/api/audit.ts` — request parsing, abuse limiter call, audit orchestration, stable JSON errors.
- `src/pages/index.astro` — semantic shell and page composition.
- `src/components/AuditForm.astro` — URL entry, live/demo actions, status.
- `src/components/FindingsPanel.astro` — finding counts and selectable rows.
- `src/components/FixScopePanel.astro` — selected bounded scope.
- `src/components/VerificationPanel.astro` — fixed/still-present/not-verifiable results.
- `src/styles/global.css` — restrained responsive/accessibility styling.
- `src/middleware.ts` — application security headers.
- `test/*.test.ts` — deterministic unit/integration contracts.
- `.github/workflows/ci.yml` — install, check, test, build.
- `README.md`, `LICENSE`, `docs/architecture.md`, `docs/security.md`, `docs/challenge-scope.md` — challenge/public documentation.

---

### Task 1: Establish the Worker/Astro repository foundation

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `astro.config.mjs`
- Create: `tsconfig.json`
- Create: `wrangler.jsonc`
- Create: `public/.assetsignore`
- Create: `src/env.d.ts`
- Create: `src/pages/index.astro`
- Create: `src/styles/global.css`
- Create: `.gitignore`
- Create: `LICENSE`

**Interfaces:**
- Consumes: approved architecture spec only.
- Produces: a clean Astro SSR application that builds for Cloudflare Workers and has stable npm scripts used by every later task.

- [ ] **Step 1: Scaffold with Cloudflare's first-party Astro generator in a temporary directory**

Run from a clean working directory, not directly over the repository:

```bash
npm create cloudflare@latest -- /tmp/loopfix-c3 --framework=astro
```

Choose the minimal Astro starter, TypeScript strict mode, Cloudflare Workers target, and do not deploy during scaffolding.

- [ ] **Step 2: Copy only the required generated foundation into the repository**

Copy `package.json`, `package-lock.json`, `astro.config.mjs`, `tsconfig.json`, `wrangler.jsonc`, `src/env.d.ts`, and the minimum generated static/Worker files. Keep the already committed `docs/` tree. Remove starter demo content, framework logos, generated marketing copy, and unused assets.

- [ ] **Step 3: Add the WebMCP type dependency and test tooling**

Run:

```bash
npm install --save-dev webmcp-types@0.1.3 vitest @astrojs/check
```

Do not add a runtime WebMCP package.

- [ ] **Step 4: Normalize npm scripts**

`package.json` must expose these scripts exactly:

```json
{
  "scripts": {
    "dev": "astro dev",
    "check": "astro check",
    "test": "vitest run",
    "test:watch": "vitest",
    "build": "astro build",
    "verify": "npm run check && npm test && npm run build",
    "deploy": "wrangler deploy"
  }
}
```

Preserve generator-required package metadata and Cloudflare dependencies.

- [ ] **Step 5: Configure TypeScript to load WebMCP declarations**

Ensure `tsconfig.json` extends Astro strict settings and includes:

```json
{
  "compilerOptions": {
    "types": ["webmcp-types"]
  }
}
```

If Cloudflare-generated types are also required, include both rather than replacing them.

- [ ] **Step 6: Set explicit Worker configuration**

`wrangler.jsonc` must use the generated Astro Worker entry and assets binding, set a current compatibility date from the implementation day, enable `nodejs_compat` only if the generated adapter requires it, and enable observability. Add the rate-limit binding name now so Task 6 can consume it:

```jsonc
"ratelimits": [
  {
    "name": "AUDIT_RATE_LIMITER",
    "namespace_id": "1001",
    "simple": { "limit": 10, "period": 60 }
  }
]
```

Use an integer namespace ID unique within this Worker configuration.

- [ ] **Step 7: Create the minimal semantic shell**

`src/pages/index.astro` initially renders only:

```astro
---
import "../styles/global.css";
---
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>LoopFix WebMCP</title>
    <meta name="description" content="A human-agent WebMCP workflow for deterministic technical SEO auditing and fix verification." />
  </head>
  <body>
    <main id="app">
      <h1>LoopFix WebMCP</h1>
      <p>Audit a public page, choose a bounded fix scope, then re-audit to verify what changed.</p>
    </main>
  </body>
</html>
```

No client framework hydration is added.

- [ ] **Step 8: Add a restrained global baseline**

`src/styles/global.css` must establish system fonts, dark/light-compatible CSS variables, a single accent token, readable max content width, native focus-visible outlines, minimum button/input target sizing, and `prefers-reduced-motion` handling. Do not add gradients, animation libraries, or ornamental effects.

- [ ] **Step 9: Add the MIT license**

Create root `LICENSE` with the standard MIT text and copyright line:

```text
Copyright (c) 2026 Tomi Šeregi
```

- [ ] **Step 10: Verify the foundation**

Run:

```bash
npm run check
npm test
npm run build
```

Expected: check/build pass; Vitest exits cleanly even before domain tests are added. If Vitest requires a test file, add `test/foundation.test.ts` asserting `true` and remove it once real tests exist.

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json astro.config.mjs tsconfig.json wrangler.jsonc public src .gitignore LICENSE
 git commit -m "chore: scaffold LoopFix WebMCP worker app"
```

---

### Task 2: Implement URL policy and SSRF input rejection

**Files:**
- Create: `src/lib/audit/types.ts`
- Create: `src/lib/audit/url-policy.ts`
- Create: `test/url-policy.test.ts`

**Interfaces:**
- Produces: `parsePublicTarget(input: unknown): URL` and `AuditError`.
- Later tasks call this function before every initial fetch and redirect fetch.

- [ ] **Step 1: Define domain errors and core types**

In `src/lib/audit/types.ts` define:

```ts
export type Severity = "error" | "warning" | "notice";

export class AuditError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "AuditError";
  }
}
```

Also define `Finding` and `AuditRun` exactly as in the approved spec so all later modules share one contract.

- [ ] **Step 2: Write failing URL policy tests**

`test/url-policy.test.ts` must cover at minimum:

```ts
expect(parsePublicTarget("https://example.org/a#x").href).toBe("https://example.org/a");
expect(() => parsePublicTarget("file:///etc/passwd")).toThrowError(/HTTP or HTTPS/);
expect(() => parsePublicTarget("https://user:pass@example.org/")).toThrowError(/credentials/);
expect(() => parsePublicTarget("https://example.org:8443/")).toThrowError(/standard ports/);
expect(() => parsePublicTarget("http://127.0.0.1/")).toThrowError(/public/);
expect(() => parsePublicTarget("http://10.0.0.1/")).toThrowError(/public/);
expect(() => parsePublicTarget("http://169.254.169.254/")).toThrowError(/public/);
expect(() => parsePublicTarget("http://[::1]/")).toThrowError(/public/);
expect(() => parsePublicTarget("http://[fd00::1]/")).toThrowError(/public/);
expect(() => parsePublicTarget("http://localhost/")).toThrowError(/public/);
expect(() => parsePublicTarget("http://foo.internal/")).toThrowError(/public/);
```

Also test >2,048-character input and malformed URL input.

- [ ] **Step 3: Run the focused test and confirm failure**

```bash
npx vitest run test/url-policy.test.ts
```

Expected: failure because `parsePublicTarget` does not exist.

- [ ] **Step 4: Implement strict parsing**

`src/lib/audit/url-policy.ts` must:

- reject non-string/blank inputs;
- reject input length > 2,048;
- parse with `new URL()`;
- allow only `http:` and `https:`;
- reject username/password;
- allow only explicit port `80` for HTTP or `443` for HTTPS; reject other explicit ports;
- normalize hostname to lower-case without trailing dot;
- reject approved blocked names/suffixes from the spec;
- reject literal IPv4 and IPv6 non-public ranges;
- clear `hash` before returning.

Use small pure helpers `isBlockedIpv4` and `isBlockedIpv6`; export only `parsePublicTarget` unless a test needs a helper directly.

- [ ] **Step 5: Run focused tests**

```bash
npx vitest run test/url-policy.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/audit/types.ts src/lib/audit/url-policy.ts test/url-policy.test.ts
 git commit -m "feat: enforce public audit URL policy"
```

---

### Task 3: Implement bounded public-page fetching

**Files:**
- Create: `src/lib/audit/fetch-public-page.ts`
- Create: `test/fetch-public-page.test.ts`

**Interfaces:**
- Consumes: `parsePublicTarget`, `AuditError`.
- Produces:

```ts
export type FetchedPage = {
  requestedUrl: string;
  canonicalUrl: string;
  html: string;
  fetchedAt: string;
};

export async function fetchPublicPage(
  input: string,
  options?: { fetchImpl?: typeof fetch; signal?: AbortSignal; now?: () => Date },
): Promise<FetchedPage>;
```

- [ ] **Step 1: Write failing fetch-boundary tests**

Use a deterministic fake `fetchImpl` and test:

- a successful HTML 200;
- one relative redirect followed successfully;
- private redirect destination rejected before second fetch;
- redirect loop rejected;
- fourth redirect rejected;
- redirect without `Location` rejected;
- non-HTML content type rejected;
- declared `Content-Length` above 2 MiB rejected before reading;
- streaming body that crosses 2 MiB rejected;
- non-2xx final response mapped to `upstream_error`;
- parent abort propagates as cancellation;
- timeout maps to `request_timeout`.

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
npx vitest run test/fetch-public-page.test.ts
```

- [ ] **Step 3: Implement timeout composition**

Use an internal `AbortController`, a 12-second timer, and forward a caller signal:

```ts
const controller = new AbortController();
const abortFromParent = () => controller.abort(options.signal?.reason);
options.signal?.addEventListener("abort", abortFromParent, { once: true });
```

Always clear the timer and listener in `finally`.

- [ ] **Step 4: Implement manual redirect handling**

Perform GET with:

```ts
{
  method: "GET",
  redirect: "manual",
  headers: {
    accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
    "user-agent": "LoopFix-WebMCP/1.0 (+https://github.com/AKzar1el/loopfix-mcp)"
  },
  signal
}
```

For status 301/302/303/307/308, resolve `Location` against the current URL, call `parsePublicTarget` again, reject loops, and cap at three redirects.

- [ ] **Step 5: Implement bounded streaming reads**

Read `response.body` with a reader and `TextDecoder`, accumulate bytes, and cancel immediately once the 2 MiB limit is exceeded. Check `Content-Length` first when present.

- [ ] **Step 6: Run focused tests**

```bash
npx vitest run test/fetch-public-page.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/audit/fetch-public-page.ts test/fetch-public-page.test.ts
 git commit -m "feat: add bounded public page fetcher"
```

---

### Task 4: Implement the deterministic audit analyzer

**Files:**
- Create: `src/lib/audit/findings.ts`
- Create: `src/lib/audit/analyze-page.ts`
- Create: `test/analyze-page.test.ts`

**Interfaces:**
- Consumes: `FetchedPage`, `Finding`, `Severity`.
- Produces:

```ts
export const AUDIT_RULES_VERSION = "2026-08-28.1";
export function analyzePage(page: FetchedPage): AuditRun;
```

- [ ] **Step 1: Freeze rule metadata**

`findings.ts` defines one immutable metadata record per approved code with `severity`, `title`, `whyItMatters`, and `recommendedAction`. Keep descriptions factual and bounded. Do not claim Google ranking guarantees.

- [ ] **Step 2: Write failing tests for all 13 rules**

Each rule gets at least one positive case and representative clean case. Use tiny inline HTML strings. Required examples include:

```html
<html><head></head><body><p>x</p></body></html>
```

for missing title/description/h1/canonical/viewport/lang, and:

```html
<html lang="en"><head><title>A sufficiently descriptive page title for testing</title><meta name="description" content="A sufficiently detailed description that passes the LoopFix heuristic without claiming to be a search-engine requirement."><meta name="viewport" content="width=device-width"><link rel="canonical" href="https://example.org/"></head><body><h1>Example</h1><img src="x.png" alt="Example"></body></html>
```

for the clean baseline.

- [ ] **Step 3: Run the analyzer tests and confirm failure**

```bash
npx vitest run test/analyze-page.test.ts
```

- [ ] **Step 4: Implement small source-inspection helpers**

Implement helpers that extract only the required metadata:

- `extractTitle`
- `extractMetaContent(name)`
- `countStartTags(tag)`
- `hasCanonical`
- `htmlLang`
- `countImagesMissingAlt`

Normalize whitespace and decode only a minimal safe subset needed for length heuristics; do not execute scripts, construct a browser DOM from remote input, or expose arbitrary page body text.

- [ ] **Step 5: Implement evidence caps**

Every `observedEvidence` string must be generated by LoopFix, not copied wholesale. Examples:

```text
No non-empty <title> element was found.
Title length: 18 characters.
3 image elements are missing an alt attribute.
Robots meta includes noindex.
```

Cap evidence to 240 characters even though generated evidence should normally be much shorter.

- [ ] **Step 6: Implement stable finding identity**

Each finding ID is exactly:

```ts
`finding:${code}`
```

Sort findings by severity order `error`, `warning`, `notice`, then code to keep output deterministic.

- [ ] **Step 7: Run focused tests**

```bash
npx vitest run test/analyze-page.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/audit/findings.ts src/lib/audit/analyze-page.ts test/analyze-page.test.ts
 git commit -m "feat: add deterministic SEO audit rules"
```

---

### Task 5: Implement verification, demo fixtures, and shared app state

**Files:**
- Create: `src/lib/app/verification.ts`
- Create: `src/lib/app/state.ts`
- Create: `src/demo/before.ts`
- Create: `src/demo/after.ts`
- Create: `test/verification.test.ts`
- Create: `test/app-state.test.ts`
- Create: `test/demo.test.ts`

**Interfaces:**
- Produces:

```ts
export type VerificationStatus = "fixed" | "still_present" | "not_verifiable";
export type VerificationResult = { findingId: string; status: VerificationStatus };
export function compareSelectedFindings(selectedIds: string[], before: AuditRun, after: AuditRun): VerificationResult[];

export type LoopFixState = {
  mode: "live" | "demo";
  audit: AuditRun | null;
  selectedFindingIds: string[];
  verification: { audit: AuditRun; results: VerificationResult[] } | null;
};
```

`createLoopFixStore()` returns `getState`, `subscribe`, `replaceAudit`, `setScope`, `setVerification`, and `reset`.

- [ ] **Step 1: Write failing verification tests**

Test selected finding present in before and absent in after -> `fixed`; present in both -> `still_present`; selected ID not resolvable from the before run -> rejected by scope/state validation rather than silently compared.

- [ ] **Step 2: Implement pure verification**

Compare stable finding IDs/codes only. Preserve selection order in result output.

- [ ] **Step 3: Write failing store tests**

Test:

- `replaceAudit` sets mode/audit and clears selection + verification;
- `setScope` accepts 1..10 unique IDs all present in active audit;
- invalid/unknown IDs reject without partial mutation;
- `setVerification` requires an active scope;
- subscribers observe one immutable snapshot per mutation.

- [ ] **Step 4: Implement the store**

Use a closure and immutable object replacement. Do not expose direct writable arrays.

- [ ] **Step 5: Create deterministic demo fixtures**

`before.ts` and `after.ts` export complete `AuditRun` objects for fictional `https://demo.loopfix.example/` data. The before fixture must include at least four findings. The after fixture must make at least two selected findings disappear and intentionally leave at least one finding present so the verification UI demonstrates both `fixed` and `still_present` outcomes.

Because `.example` is reserved and blocked for live fetches, fixtures can never accidentally be treated as a real target.

- [ ] **Step 6: Test fixtures through the actual comparison function**

`test/demo.test.ts` must select a deterministic set from `before` and assert the expected mixed outcome against `after`.

- [ ] **Step 7: Run focused tests**

```bash
npx vitest run test/verification.test.ts test/app-state.test.ts test/demo.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/app src/demo test/verification.test.ts test/app-state.test.ts test/demo.test.ts
 git commit -m "feat: add shared fix loop state and demo verification"
```

---

### Task 6: Build the audit API, rate limiting, and security headers

**Files:**
- Create: `src/pages/api/audit.ts`
- Create: `src/middleware.ts`
- Create: `test/audit-api.test.ts`
- Create: `test/security-headers.test.ts`

**Interfaces:**
- Consumes: `fetchPublicPage`, `analyzePage`, `AuditError`.
- Produces: `POST /api/audit` and shared security headers.

- [ ] **Step 1: Write failing API tests around an extracted handler**

Keep the route thin by exporting a testable function:

```ts
export async function handleAuditRequest(request: Request, runtime: AuditRuntime): Promise<Response>
```

where `AuditRuntime` injects `fetchImpl`, optional rate limiter, and current time.

Test:

- non-POST -> 405;
- non-JSON or malformed body -> 400;
- body > 4 KiB -> 413;
- missing/extra properties -> 400;
- valid request -> bounded `AuditRun` JSON;
- `AuditError` codes/statuses preserved;
- unknown exception -> `500 { error: "internal_error", message: "The audit could not be completed." }`;
- rate limit failure -> 429.

- [ ] **Step 2: Implement explicit request parsing**

Reject arrays, extra keys, blank URLs, and oversized bodies before calling the fetch service. Set API responses:

```text
Content-Type: application/json; charset=utf-8
Cache-Control: no-store
X-Content-Type-Options: nosniff
```

- [ ] **Step 3: Add a limiter abstraction**

Define:

```ts
export interface AuditLimiter {
  allow(key: string): Promise<boolean>;
}
```

The production adapter calls the Cloudflare `AUDIT_RATE_LIMITER.limit({ key })` binding. Unit tests inject a fake.

Build the key from Cloudflare client IP when available but hash it before use. Do not persist the raw IP or log it. If no Cloudflare IP exists in local development, use a bounded fallback key such as `local`.

- [ ] **Step 4: Write failing security-header tests**

Test middleware adds at least:

```text
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
X-Frame-Options: DENY
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), tools=(self)
```

and a CSP that starts with `default-src 'self'` and does not contain wildcard source `*`.

- [ ] **Step 5: Implement middleware**

Start with a conservative CSP suitable for the actual Astro output:

```text
default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'
```

If Astro's built output requires a specific safe adjustment, make the narrowest verified change and document it in `docs/security.md`; do not loosen to wildcards.

- [ ] **Step 6: Run focused tests and full build**

```bash
npx vitest run test/audit-api.test.ts test/security-headers.test.ts
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add src/pages/api/audit.ts src/middleware.ts test/audit-api.test.ts test/security-headers.test.ts wrangler.jsonc
 git commit -m "feat: secure and rate limit audit API"
```

---

### Task 7: Implement the shared browser service and human UI

**Files:**
- Create: `src/lib/app/audit-client.ts`
- Create: `src/lib/app/controller.ts`
- Create: `src/components/AuditForm.astro`
- Create: `src/components/FindingsPanel.astro`
- Create: `src/components/FixScopePanel.astro`
- Create: `src/components/VerificationPanel.astro`
- Modify: `src/pages/index.astro`
- Modify: `src/styles/global.css`
- Create: `test/controller.test.ts`

**Interfaces:**
- Produces one `LoopFixController` object used later by WebMCP:

```ts
export type LoopFixController = {
  runAudit(url: string, signal?: AbortSignal): Promise<AuditRun>;
  loadDemo(): AuditRun;
  listFindings(input?: { severity?: Severity; limit?: number }): Finding[];
  inspectFinding(findingId: string): Finding;
  setFixScope(findingIds: string[]): void;
  verifyFixScope(signal?: AbortSignal): Promise<VerificationResult[]>;
  getState(): LoopFixState;
};
```

- [ ] **Step 1: Write failing browser-client/controller tests**

Mock `fetch` and assert:

- `runAudit` forwards signal and only commits state after valid success;
- failed new audit leaves previous successful state intact;
- `loadDemo` resets previous live state;
- list filter/limit is deterministic and capped at 10;
- inspection rejects unknown ID;
- verify uses demo after-fixture in demo mode;
- verify calls `/api/audit` with the existing canonical URL in live mode and does not accept a URL input.

- [ ] **Step 2: Implement `audit-client.ts`**

POST same-origin JSON to `/api/audit`, forward `AbortSignal`, parse stable error JSON, and throw a small typed `AuditClientError`. Do not use `credentials: include`; the app has no auth requirement.

- [ ] **Step 3: Implement `controller.ts`**

Use the store from Task 5. All UI and WebMCP methods must delegate here, never directly mutate state in separate code paths.

- [ ] **Step 4: Build semantic Astro components**

Use native markup with stable data hooks:

```text
#loopfix-audit-form
#loopfix-url
#loopfix-run
#loopfix-demo
#webmcp-status
#findings-panel
#fix-scope-panel
#verification-panel
#app-live-region
```

Finding selection must use real checkboxes. Buttons remain disabled when their preconditions are not met.

- [ ] **Step 5: Wire one small client entry in `index.astro`**

The browser script creates the store/controller, subscribes one renderer, and connects DOM events to controller methods. It must expose the controller only within module scope; do not attach it to `window` as a debugging shortcut.

- [ ] **Step 6: Implement visible state rendering**

Render via `textContent`, DOM node creation, and safe attribute assignment. Do not use remote-derived strings with `innerHTML`.

Agent-driven state changes and human-driven state changes must update the same panels and send concise `aria-live="polite"` messages such as:

```text
Audit completed with 5 findings.
Fix scope updated to 3 findings.
Verification completed: 2 fixed, 1 still present.
```

- [ ] **Step 7: Complete responsive styling**

Use a single-column small-screen layout and a two-column findings/scope layout only where width permits. Keep URLs and evidence wrap-safe. Severity must include textual labels, not color alone.

- [ ] **Step 8: Run focused and full verification**

```bash
npx vitest run test/controller.test.ts
npm run check
npm run build
```

- [ ] **Step 9: Commit**

```bash
git add src/lib/app src/components src/pages/index.astro src/styles/global.css test/controller.test.ts
 git commit -m "feat: build shared LoopFix human workflow"
```

---

### Task 8: Add the five native WebMCP tools

**Files:**
- Create: `src/lib/webmcp/schemas.ts`
- Create: `src/lib/webmcp/tools.ts`
- Create: `src/lib/webmcp/register.ts`
- Modify: `src/pages/index.astro`
- Create: `test/webmcp-tools.test.ts`

**Interfaces:**
- Consumes: `LoopFixController`.
- Produces: exactly five `ModelContextTool` definitions and registration lifecycle.

- [ ] **Step 1: Write schema/metadata contract tests first**

Assert exactly these names, sorted:

```ts
[
  "inspect_finding",
  "list_findings",
  "run_audit",
  "set_fix_scope",
  "verify_fix_scope",
]
```

Assert every schema has `type: "object"` and `additionalProperties: false`; assert the approved annotations; assert descriptions are concise and contain no instructional prompt-injection language.

- [ ] **Step 2: Freeze input schemas in `schemas.ts`**

Use the exact schemas from the approved design. Do not accept aliases, arbitrary object values, or extra options.

- [ ] **Step 3: Implement strict runtime guards**

Tool handlers must validate input again even though the browser provides a schema. Implement small guards:

```ts
assertRunAuditInput
assertListFindingsInput
assertInspectFindingInput
assertSetFixScopeInput
assertEmptyInput
```

Reject unknown keys and invalid types before calling the controller.

- [ ] **Step 4: Implement bounded textual results**

Return compact plain objects/strings containing only generated data. `list_findings` includes at most 10 compact entries. `inspect_finding` includes one bounded finding. No handler returns raw HTML.

- [ ] **Step 5: Test handlers with a fake controller**

Verify:

- `run_audit` forwards the execution `AbortSignal`;
- read-only tools never mutate controller state;
- `set_fix_scope` accepts only validated current IDs via controller;
- `verify_fix_scope` accepts no URL and forwards `AbortSignal`;
- thrown controller errors become short actionable errors without stack traces.

- [ ] **Step 6: Implement registration lifecycle**

`register.ts` exports:

```ts
export async function registerLoopFixTools(controller: LoopFixController): Promise<{
  supported: boolean;
  count: number;
  dispose: () => void;
}>;
```

Behavior:

1. Check `"modelContext" in document` and `document.modelContext` availability.
2. If unsupported, return `{ supported: false, count: 0, dispose: () => {} }`.
3. Create one `AbortController`.
4. Register all five tools with `{ signal: registrationController.signal }`.
5. Return disposer that aborts registration.

Do not use `exposedTo`.

- [ ] **Step 7: Wire registration after controller initialization**

Update `#webmcp-status` to one of:

```text
WebMCP ready · 5 tools
WebMCP unavailable in this browser
WebMCP registration failed
```

Tool absence must not break the normal human UI.

- [ ] **Step 8: Run focused tests and static checks**

```bash
npx vitest run test/webmcp-tools.test.ts
npm run check
npm run build
```

- [ ] **Step 9: Commit**

```bash
git add src/lib/webmcp src/pages/index.astro test/webmcp-tools.test.ts
 git commit -m "feat: expose native WebMCP fix loop tools"
```

---

### Task 9: Add CI and public challenge documentation

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `README.md`
- Create: `docs/architecture.md`
- Create: `docs/security.md`
- Create: `docs/challenge-scope.md`

**Interfaces:**
- Produces: anonymous reviewer/judge setup and provenance documentation required by the challenge.

- [ ] **Step 1: Add CI**

`.github/workflows/ci.yml` runs on pushes and pull requests to `main` with Node 22:

```yaml
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
  with:
    node-version: 22
    cache: npm
- run: npm ci
- run: npm run check
- run: npm test
- run: npm run build
```

Set minimal workflow permissions:

```yaml
permissions:
  contents: read
```

- [ ] **Step 2: Write README first screen for judges**

The first screen must include:

- `LoopFix WebMCP` title;
- one-sentence human-agent workflow;
- challenge attribution;
- live URL once deployed;
- five-tool table;
- 60-second local setup;
- browser testing instructions for ChatGPT in-app browser and Chrome 149+ WebMCP flag;
- `npm run verify` command;
- MIT badge or plain visible license link, without a badge wall.

- [ ] **Step 3: Write `docs/architecture.md`**

Condense the approved spec into a reviewer-facing architecture document with one request/data-flow diagram in Mermaid:

```mermaid
sequenceDiagram
  participant H as Human UI
  participant A as Agent
  participant W as WebMCP tools
  participant C as Shared controller
  participant API as /api/audit
  participant T as Target page
  H->>C: run audit / select scope
  A->>W: invoke tool
  W->>C: same application service
  C->>API: bounded audit request
  API->>T: validated GET
  T-->>API: bounded HTML
  API-->>C: deterministic findings
  C-->>H: visible shared state
  C-->>W: compact result
```

- [ ] **Step 4: Write `docs/security.md`**

Document threat boundaries accurately:

- SSRF protections and DNS-rebinding limitation;
- no credentials/custom headers/private network intent;
- redirect revalidation;
- response/timeout caps;
- untrusted page content handling;
- no raw HTML in agent results;
- WebMCP annotations;
- same-origin tool exposure only;
- no persistent user data;
- coarse rate limiting and its shared-IP limitation;
- security headers.

- [ ] **Step 5: Write `docs/challenge-scope.md`**

State explicitly:

- repo created during challenge period;
- project is a new standalone challenge artifact;
- DigestSEO informed the workflow and some audit-hardening concepts, but private commercial source is not required to run LoopFix;
- challenge work is visible in dated public commit history;
- no prior Sponsor preferential/financial development support is claimed.

- [ ] **Step 6: Run full verification**

```bash
npm ci
npm run verify
```

- [ ] **Step 7: Commit**

```bash
git add .github README.md docs
 git commit -m "docs: prepare LoopFix WebMCP challenge release"
```

---

### Task 10: Production browser verification and release hardening

**Files:**
- Modify only files proven necessary by deployment/browser testing.
- Create: `docs/release-checklist.md`

**Interfaces:**
- Produces: verified public challenge build and exact judge test instructions.

- [ ] **Step 1: Run complete local verification from a clean install**

```bash
rm -rf node_modules dist .astro
npm ci
npm run verify
```

Expected: check, tests, and Worker build all pass.

- [ ] **Step 2: Run Wrangler locally**

```bash
npm run build
npx wrangler dev
```

Exercise `/` and `/api/audit`. Verify at least one real public HTML page and blocked private/literal addresses. Do not use a third-party site aggressively; one bounded request is sufficient for smoke testing.

- [ ] **Step 3: Deploy the exact tested commit**

```bash
npm run deploy
```

Record the resulting `*.workers.dev` URL. Add `fixloop.digestseo.com` only after the Worker build is stable and DNS/custom-domain configuration is ready; do not make custom-domain setup a blocker for functional testing.

- [ ] **Step 4: Verify production headers and API behavior**

Check:

```bash
curl -I https://<deployed-host>/
curl -sS -X POST https://<deployed-host>/api/audit \
  -H 'content-type: application/json' \
  --data '{"url":"https://example.com/"}'
```

Confirm security headers, JSON cache controls, and bounded output.

- [ ] **Step 5: Test in Chrome 149+ with WebMCP enabled**

Enable:

```text
chrome://flags/#enable-webmcp-testing
```

Restart Chrome and run in DevTools:

```js
await document.modelContext.getTools()
```

Expected: exactly five tools with approved names and annotations.

- [ ] **Step 6: Execute all tools manually**

Use `getTools()` to locate each tool and `document.modelContext.executeTool(...)` to test:

1. `run_audit` against a safe public page;
2. `list_findings` with `{ limit: 5 }`;
3. `inspect_finding` using an actual returned ID;
4. `set_fix_scope` with one to three actual IDs;
5. `verify_fix_scope` with `{}`.

Confirm every state mutation is visible in the page.

- [ ] **Step 7: Test demo mode end to end**

From a clean reload:

1. click `Try demo`;
2. use WebMCP to list findings;
3. set a three-finding scope;
4. verify;
5. confirm mixed fixed/still-present results and no network dependency for demo verification.

- [ ] **Step 8: Test through ChatGPT's in-app browser**

Run natural-language requests equivalent to:

```text
Audit this page and summarize the errors.
Show me the evidence for the most important finding.
Select a small fix scope of up to three findings.
Verify the selected scope now.
```

Document any tool-selection ambiguity and improve descriptions only if testing proves it necessary.

- [ ] **Step 9: Run Lighthouse/WebMCP inspection where available**

Confirm the registered WebMCP tools are discoverable and no console errors occur during the core flow.

- [ ] **Step 10: Perform mobile/keyboard accessibility smoke tests**

At approximately 320px width and desktop width:

- no page-level horizontal overflow;
- URL/evidence wraps safely;
- all controls reachable by keyboard;
- visible focus remains present;
- checkboxes and buttons work without hover;
- live region announces state transitions.

- [ ] **Step 11: Write release checklist with observed facts only**

`docs/release-checklist.md` records:

- tested commit SHA;
- deployed URL;
- Chrome version used;
- ChatGPT in-app browser test date;
- five registered tool names;
- `npm run verify` result;
- known non-blocking limitations.

Do not claim a client was tested unless it actually was.

- [ ] **Step 12: Final commit for verified hardening/documentation**

```bash
git add -A
 git commit -m "chore: verify production WebMCP challenge build"
```

Only include changes justified by the release tests.

---

## Plan Self-Review

### Spec coverage

- Public independent repo + MIT license: Tasks 1 and 9.
- Cloudflare Worker deployment: Tasks 1 and 10.
- URL/SSRF controls: Tasks 2 and 3.
- Bounded deterministic audit: Tasks 3 and 4.
- Exactly 13 approved rules: Task 4.
- Shared human/WebMCP state: Tasks 5 and 7.
- Exactly five native WebMCP tools: Task 8.
- AbortSignal propagation: Tasks 3, 7, and 8.
- `untrustedContentHint` / `readOnlyHint`: Task 8.
- No `exposedTo`: Task 8.
- Deterministic judge demo: Task 5 and Task 10.
- Rate limiting/security headers: Task 6.
- Accessibility/responsive presentation: Task 7 and Task 10.
- CI/docs/challenge provenance: Task 9.
- Browser/client production verification: Task 10.

### Type consistency

The plan uses one `AuditRun`, `Finding`, `LoopFixState`, `VerificationResult`, and `LoopFixController` contract throughout. Tool handlers consume only the controller; UI events consume only the controller; fetch/analyzer modules remain server-side pure services.

### Scope control

This plan deliberately excludes GSC, multi-page crawling, authentication, persistence, automatic fixes, LLM calls, remote MCP transport, and additional SEO rules. Any of those require a separate post-challenge design.
