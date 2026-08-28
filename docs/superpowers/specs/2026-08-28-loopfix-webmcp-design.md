# LoopFix WebMCP Architecture Design

## Context

`AKzar1el/loopfix-mcp` is a new public repository for the OpenAI WebMCP Challenge. The repository is intentionally separate from the private `digestseo-site` application so the challenge submission can be fully inspectable and open source without exposing the commercial codebase.

The product name is **LoopFix WebMCP**. The existing repository name `loopfix-mcp` is retained for now; the README, package metadata, UI, and submission copy will consistently use `LoopFix WebMCP` so the browser-facing technology is unambiguous.

The implementation is a small standalone Astro application deployed on Cloudflare Workers. It provides a deterministic single-page technical SEO audit and a visible human-agent remediation loop through the native WebMCP imperative API.

Primary flow:

`Audit -> Inspect -> Select scope -> Implement outside LoopFix -> Re-audit -> Verify`

The human remains in control of what is selected and implemented. LoopFix does not modify websites, repositories, deployments, credentials, or third-party systems.

## External Standards and Guidance

The design follows the current WebMCP draft and first-party implementation guidance available on August 28, 2026:

- WebMCP draft report, published August 26, 2026: <https://webmachinelearning.github.io/webmcp/>
- Chrome WebMCP overview: <https://developer.chrome.com/docs/ai/webmcp>
- Chrome imperative API: <https://developer.chrome.com/docs/ai/webmcp/imperative-api>
- Chrome best practices: <https://developer.chrome.com/docs/ai/webmcp/best-practices>
- Chrome tool-security guidance: <https://developer.chrome.com/docs/ai/webmcp/secure-tools>
- WebMCP Challenge rules: <https://webmcp.devpost.com/rules>
- Cloudflare Astro on Workers: <https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/>
- Cloudflare Rate Limiting binding: <https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/>

Important current constraints copied into the design:

- Use `document.modelContext`, not deprecated `navigator.modelContext`.
- WebMCP is available only in a secure, origin-isolated document and is gated by the `tools` Permissions Policy.
- Tool handlers receive an `AbortSignal`; long-running work must propagate cancellation where possible.
- Tool descriptions should stay below roughly 500 characters, parameter descriptions below 150 characters, tool/parameter names below 30 characters, and individual tool outputs below roughly 1.5K characters.
- Tool schemas help models, but server/client code remains the real validation boundary.
- Externally sourced page content must be treated as untrusted and relevant tools must set `untrustedContentHint: true`.
- Read-only tools must set `readOnlyHint: true`.
- Cross-origin exposure through `exposedTo` is not used.

## Goals

1. Ship a challenge-ready, independently runnable open-source WebMCP application.
2. Expose exactly five clear, non-overlapping WebMCP tools around one remediation workflow.
3. Keep the human and agent in one visible shared interface state.
4. Perform real deterministic audits of public HTML pages without an AI backend.
5. Provide a deterministic local demo fixture so judges can complete the full loop even when a live target does not change during judging.
6. Preserve strict SSRF, redirect, response-size, timeout, content-type, and rate-limit boundaries.
7. Keep the repository small enough to understand quickly and test completely before the challenge deadline.
8. Use semantic HTML, accessible controls, restrained visual design, and minimal client JavaScript.

## Non-goals

- No website modification or automatic code deployment.
- No GitHub writes.
- No Google Search Console integration.
- No user accounts, authentication, billing, database, analytics dashboard, or retained audit history.
- No LLM calls or generated SEO advice on the server.
- No arbitrary HTTP headers, cookies, credentials, request bodies, private URLs, or custom ports supplied by the agent.
- No multi-page crawler.
- No remote MCP server.
- No framework abstraction around WebMCP unless native support proves insufficient during verified testing.
- No broad extraction or publication of private DigestSEO source.

## Platform and Runtime

### Application framework

- Astro 5.x with TypeScript.
- `@astrojs/cloudflare` adapter.
- Cloudflare Workers as the primary deployment target rather than a new Pages project, following Cloudflare's August 2026 recommendation to start new applications on Workers.
- Minimal vanilla browser TypeScript for shared state, rendering coordination, and WebMCP registration.
- No React dependency.

### Development and verification

- Node.js 22 LTS baseline.
- npm with a committed lockfile.
- Vitest for unit tests.
- Astro type checking.
- Wrangler for local Worker emulation, runtime types, and deployment.
- GitHub Actions for install, typecheck, test, and build on pushes and pull requests.

### Dependency policy

Runtime dependencies must be limited to Astro/Cloudflare integration and packages directly required by Astro. No general-purpose schema library, state-management library, HTML parsing framework, UI kit, analytics SDK, or WebMCP wrapper is added unless a verified requirement cannot be met with platform APIs and small local modules.

A dev-only WebMCP type package may be used if it matches current Chrome guidance and does not add runtime code.

## Product State Model

LoopFix keeps all workflow state in the active browser session. Refreshing the page resets the session.

```ts
type Severity = "error" | "warning" | "notice";

type Finding = {
  id: string;
  code: string;
  severity: Severity;
  title: string;
  affectedUrl: string;
  observedEvidence: string;
  whyItMatters: string;
  recommendedAction: string;
};

type AuditRun = {
  requestedUrl: string;
  canonicalUrl: string;
  fetchedAt: string;
  rulesVersion: string;
  findings: Finding[];
};

type VerificationStatus = "fixed" | "still_present" | "not_verifiable";

type VerificationResult = {
  findingId: string;
  status: VerificationStatus;
};

type LoopFixState = {
  mode: "live" | "demo";
  audit: AuditRun | null;
  selectedFindingIds: string[];
  verification: {
    audit: AuditRun;
    results: VerificationResult[];
  } | null;
};
```

State mutations must go through one state module used by both visible UI controls and WebMCP tool handlers. Tool handlers must never mutate DOM-only hidden state that the user cannot observe.

## Exact WebMCP Tool Surface

Exactly five tools are exposed. Names are snake_case, action-oriented, short, and stable.

### 1. `run_audit`

Purpose: run a bounded deterministic audit for one public HTTP(S) HTML page and make it the active audit in the visible interface.

Input schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "url": {
      "type": "string",
      "description": "Complete public HTTP or HTTPS page URL to audit."
    }
  },
  "required": ["url"]
}
```

Annotations:

```json
{
  "readOnlyHint": false,
  "untrustedContentHint": true
}
```

`readOnlyHint` is false because the tool changes active application state even though it does not modify the remote target.

Execution:

1. Validate the input in client code before the request.
2. POST `{ "url": string }` to the same-origin `/api/audit` endpoint with the WebMCP handler's `AbortSignal` forwarded to `fetch`.
3. The server independently validates and fetches the URL.
4. Normalize the response into `AuditRun`.
5. Replace active audit state, clear prior selection and verification state, update the visible interface, then return a compact summary.

Output budget: target <= 1,000 characters. Return canonical URL, counts by severity, total finding count, and the next useful action. Do not return raw HTML or every finding.

### 2. `list_findings`

Purpose: return a compact list of findings from the current audit so an agent can decide what to inspect or select.

Input schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "severity": {
      "type": "string",
      "enum": ["error", "warning", "notice"],
      "description": "Optional severity filter."
    },
    "limit": {
      "type": "integer",
      "minimum": 1,
      "maximum": 10,
      "description": "Maximum findings to return; defaults to 10."
    }
  }
}
```

Annotations:

```json
{
  "readOnlyHint": true,
  "untrustedContentHint": true
}
```

Execution validates the active audit exists, filters deterministically, caps output at 10 rows, and returns only: `id`, `severity`, `code`, `title`, `affectedUrl`, and `selected`.

### 3. `inspect_finding`

Purpose: return bounded evidence and remediation guidance for one finding already present in the current audit.

Input schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "findingId": {
      "type": "string",
      "description": "Finding ID returned by list_findings."
    }
  },
  "required": ["findingId"]
}
```

Annotations:

```json
{
  "readOnlyHint": true,
  "untrustedContentHint": true
}
```

The requested ID must exist in the current state. Output contains one finding's code, severity, title, observed evidence, reason, and bounded recommended action. Evidence strings are plain data and are never executed or reinterpreted as instructions.

### 4. `set_fix_scope`

Purpose: set the visible bounded list of findings that the human intends to fix.

Input schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "findingIds": {
      "type": "array",
      "items": { "type": "string" },
      "minItems": 1,
      "maxItems": 10,
      "uniqueItems": true,
      "description": "One to ten current finding IDs to include in the fix scope."
    }
  },
  "required": ["findingIds"]
}
```

Annotations:

```json
{
  "readOnlyHint": false,
  "untrustedContentHint": true
}
```

All IDs must exist in the active audit. The handler updates shared state and the visible scope panel. It does not generate code, change the target website, or persist selection remotely.

### 5. `verify_fix_scope`

Purpose: run a fresh audit of the same canonical URL and compare the selected finding identities with the new run.

Input schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

Annotations:

```json
{
  "readOnlyHint": false,
  "untrustedContentHint": true
}
```

Preconditions:

- An active audit exists.
- At least one finding is selected.

Execution:

1. Reuse the active audit's canonical URL. The agent cannot supply a verification URL.
2. In live mode, call `/api/audit` again with the tool `AbortSignal` forwarded to `fetch`.
3. In demo mode, load the committed deterministic `after` fixture through the same comparison interface.
4. Compare selected finding codes/identities to the fresh audit.
5. Store visible verification state.
6. Return each selected finding as `fixed`, `still_present`, or `not_verifiable` plus compact totals.

## WebMCP Registration Lifecycle

- Use only `document.modelContext.registerTool(...)`.
- Detect support with `"modelContext" in document` and display an informative status when unavailable.
- Register tools after the application state controller and UI are ready.
- Use one registration `AbortController` so hot reloads/page teardown can unregister the complete tool set cleanly.
- Do not use `exposedTo`; same-origin exposure is sufficient.
- Keep static registration for all five tools because handlers perform explicit precondition checks and the total surface is small. This avoids registration churn and keeps agent discovery predictable.
- Handler errors return short actionable strings rather than stack traces or internal error objects.

## Audit Service

### Public endpoint

`POST /api/audit`

Request body:

```json
{ "url": "https://example.com/" }
```

Successful response:

```json
{
  "requestedUrl": "https://example.com/",
  "canonicalUrl": "https://example.com/",
  "fetchedAt": "2026-08-28T20:00:00.000Z",
  "rulesVersion": "2026-08-28.1",
  "findings": []
}
```

Errors use a stable structure:

```json
{
  "error": "invalid_url",
  "message": "Enter a complete public HTTP or HTTPS URL."
}
```

Supported error codes include `invalid_request`, `invalid_url`, `private_url`, `unsupported_port`, `request_timeout`, `redirect_loop`, `redirect_chain_too_long`, `invalid_redirect`, `response_too_large`, `not_html`, `upstream_error`, and `rate_limited`.

### Request limits

- JSON request body <= 4 KiB.
- URL length <= 2,048 characters.
- Only `http:` and `https:`.
- No URL username/password.
- Only default ports 80/443.
- Maximum three redirects.
- Every redirect destination is independently revalidated.
- Fetch timeout: 12 seconds total per network request.
- HTML response body <= 2 MiB.
- `text/html` and `application/xhtml+xml` accepted.
- Fetch sends a transparent `LoopFix-WebMCP/1.0` user agent identifying the project URL.
- No cookies, authorization headers, referrer, or user-provided headers are forwarded.

### SSRF boundary

The server rejects:

- empty hosts,
- localhost names,
- `.localhost`, `.local`, `.internal`, `.home.arpa`, `.test`, `.invalid`, `.example`, and `.onion` suffixes,
- IPv4 loopback, link-local, private, carrier-grade NAT, documentation/reserved, multicast, and otherwise non-public ranges,
- IPv6 unspecified, loopback, unique-local, link-local, documentation, and multicast ranges.

Literal IP checks happen before the fetch and after every redirect. Cloudflare Worker egress restrictions provide defense in depth but are not treated as a replacement for application validation.

### DNS rebinding constraint

A pure hostname string check cannot prove the resolved address remains public. The design therefore avoids claiming complete DNS-level SSRF prevention. The application layer blocks literal private addresses and suspicious host classes; Cloudflare's Worker network boundary provides additional protection against local/internal destinations. The security document must state this limitation accurately.

## Deterministic Audit Rules

The challenge app intentionally uses a small, explainable set of rules that can be implemented and tested completely. Initial rules:

1. `missing_title` — no non-empty `<title>`.
2. `title_too_short` — normalized title length below 30 characters.
3. `title_too_long` — normalized title length above 60 characters.
4. `missing_meta_description` — no non-empty description meta tag.
5. `meta_description_too_short` — normalized description length below 70 characters.
6. `meta_description_too_long` — normalized description length above 160 characters.
7. `missing_h1` — no `<h1>`.
8. `multiple_h1` — more than one `<h1>`.
9. `missing_canonical` — no canonical link.
10. `missing_viewport` — no viewport meta tag.
11. `missing_lang` — `<html>` lacks a non-empty `lang` attribute.
12. `images_missing_alt` — at least one `<img>` lacks an `alt` attribute; evidence reports only the count, not arbitrary full markup.
13. `noindex_detected` — robots meta includes `noindex`.

Rules are deliberately deterministic and do not claim to measure every SEO quality factor. Thresholds are documented as LoopFix audit heuristics rather than search-engine requirements.

### HTML inspection approach

Use bounded source text and small purpose-built parsing helpers for the listed tags/attributes. The implementation must not execute fetched scripts or create a DOM from remote HTML inside the application's browser context.

Evidence must be normalized and capped. Never return arbitrary body text, script text, comments, invisible text, or page instructions to WebMCP tools.

## Finding Identity and Verification

Finding IDs are deterministic for one audit: `finding:<code>` for global single-page rules. Because the initial rule set produces at most one finding per code, verification compares codes directly.

- Finding absent in the new run -> `fixed`.
- Finding present in the new run -> `still_present`.
- Fresh audit failed or the rule is unavailable -> `not_verifiable`.

The server remains stateless. Comparison happens client-side using two validated `AuditRun` objects.

## Demo Mode

The app includes two committed fixtures:

- `src/demo/before.ts`
- `src/demo/after.ts`

They represent the exact same fictional public page before and after a bounded set of fixes. The UI visibly labels the mode **Demo data** and never implies a network audit occurred.

`Try demo` loads the before fixture into normal state. `verify_fix_scope` in demo mode loads the after fixture through the same comparison function used by live verification.

The fixture data must not contain hidden instructions, marketing claims, fabricated third-party metrics, or real-user data.

## Human Interface

### Page structure

One responsive page:

1. Header: LoopFix WebMCP identity, one-sentence purpose, GitHub link.
2. Audit form: URL input, `Run audit`, and secondary `Try demo` action.
3. WebMCP status: supported/unsupported and number of registered tools.
4. Findings panel: counts and deterministic finding rows.
5. Fix Scope panel: selected findings with clear remove controls.
6. Verification panel: only visible after verification, with status per selected finding.
7. Compact "How WebMCP helps" section explaining the five tools without marketing filler.

### Visual style

- Dark-neutral or system-adaptive professional developer-tool aesthetic.
- One restrained accent color.
- No gradients required for hierarchy, no animated background, no glassmorphism, no badge wall, no decorative charts.
- Monospace reserved for IDs/codes/URLs, not body copy.
- Information density optimized for a judge understanding the workflow in under one minute.
- Motion limited to short state transitions and disabled under `prefers-reduced-motion`.

### Accessibility

- One `<main>` landmark and ordered heading hierarchy.
- Every form control has a visible label.
- Native buttons/inputs and standard keyboard semantics.
- Finding selection uses real checkboxes.
- Tool-driven state changes announce concise updates through `aria-live="polite"`.
- Visible focus styles are never removed.
- Severity is conveyed through text/iconography as well as color.
- Target interactive size approximately 44x44 CSS pixels where practical.
- No hover-only information.

## Browser Security Headers

Worker responses for HTML should include a conservative baseline:

- `Content-Security-Policy` using self-only defaults and only the minimum directives Astro requires after the actual built output is inspected.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: no-referrer`.
- `Permissions-Policy` denying unrelated sensitive features while leaving WebMCP's own `tools` policy available to self.
- `X-Frame-Options: DENY` unless final WebMCP testing demonstrates a challenge-client requirement that conflicts with framing restrictions.
- `Cross-Origin-Opener-Policy: same-origin` only if compatibility testing confirms it does not interfere with the judge/client flow.

Headers must be tested in the deployed browser environment rather than copied blindly from a generic template.

## API Abuse Protection

A Cloudflare Rate Limiting binding protects `/api/audit` in production.

Because Cloudflare's own 2026 guidance warns that shared IP addresses can unintentionally group unrelated users, the application does not claim rate limiting to be per-person authentication. The initial anonymous abuse key is a privacy-preserving, daily salted hash derived from the incoming Cloudflare client IP plus endpoint name, used only as a coarse public-service abuse control and never persisted by application code.

Initial production target: 10 audit starts per minute per derived key. Local development uses a deterministic no-op limiter abstraction.

A `429` response returns a clear retry message. The limiter is not used for billing, quotas, or exact accounting.

## Error Handling

### Server

- Parse body once with an explicit byte limit.
- Return JSON for `/api/audit` errors.
- Never return stack traces, environment data, Worker internals, fetched HTML, or target headers.
- Log only server-side error category, generated request ID, target hostname, and timing. Do not log query strings or full submitted URLs by default.

### Client

- Keep the last successful audit visible when a verification request fails.
- A failed new `run_audit` does not partially overwrite current state.
- Abort errors are shown as cancelled rather than failed.
- WebMCP handler errors and human UI errors come from the same application service so wording stays consistent.
- All agent-facing errors remain short enough to let the agent self-correct.

## Repository Structure

```text
loopfix-mcp/
├── .github/
│   └── workflows/
│       └── ci.yml
├── docs/
│   ├── architecture.md
│   ├── security.md
│   ├── challenge-scope.md
│   └── superpowers/
│       ├── plans/
│       └── specs/
├── src/
│   ├── components/
│   │   ├── AuditForm.astro
│   │   ├── FindingsPanel.astro
│   │   ├── FixScopePanel.astro
│   │   └── VerificationPanel.astro
│   ├── demo/
│   │   ├── after.ts
│   │   └── before.ts
│   ├── lib/
│   │   ├── audit/
│   │   │   ├── analyze-page.ts
│   │   │   ├── fetch-public-page.ts
│   │   │   ├── findings.ts
│   │   │   ├── types.ts
│   │   │   └── url-policy.ts
│   │   ├── app/
│   │   │   ├── audit-client.ts
│   │   │   ├── controller.ts
│   │   │   ├── state.ts
│   │   │   └── verification.ts
│   │   └── webmcp/
│   │       ├── register.ts
│   │       ├── schemas.ts
│   │       └── tools.ts
│   ├── pages/
│   │   ├── api/
│   │   │   └── audit.ts
│   │   └── index.astro
│   ├── styles/
│   │   └── global.css
│   └── env.d.ts
├── test/
│   ├── analyze-page.test.ts
│   ├── app-state.test.ts
│   ├── demo.test.ts
│   ├── security-headers.test.ts
│   ├── url-policy.test.ts
│   ├── verification.test.ts
│   └── webmcp-tools.test.ts
├── LICENSE
├── README.md
├── astro.config.mjs
├── package-lock.json
├── package.json
├── tsconfig.json
└── wrangler.jsonc
```

File boundaries may be reduced where a component would otherwise be trivial, but no file may silently absorb unrelated responsibilities merely to match this tree.

## Public Repository and Challenge Compliance

- MIT license at repository root.
- README identifies the project as built for the OpenAI WebMCP Challenge and gives exact local setup, Chrome flag, test, and deployment instructions.
- `docs/challenge-scope.md` states the repository was created for the challenge and distinguishes inspiration/reused audit concepts from copied private-product code. Any code adapted from the user's own DigestSEO source must be identified in commit history and documented accurately.
- No secrets or private repository material are required to run the submission.
- The public repository must remain runnable independently from `digestseo-site`.
- Final Devpost "App Status" should be **New** if this standalone project remains the submitted artifact.

## Testing Strategy

Implementation follows red-green-refactor.

### Deterministic unit tests

1. URL policy: valid HTTP(S), credentials, ports, blocked names/suffixes, IPv4 ranges, IPv6 ranges, URL length.
2. Redirect handling: public redirect, private redirect rejection, missing location, loop, redirect ceiling.
3. Response handling: HTML accepted, non-HTML rejected, declared oversize rejected, streaming oversize rejected, timeout/abort mapping.
4. Audit rules: one focused test per rule plus normalization and evidence caps.
5. Verification: fixed, still-present, not-verifiable, deterministic ordering.
6. App state: run replacement, scope validation, clearing stale verification, no partial mutation on errors.
7. WebMCP schemas: names, annotations, schemas, no additional properties, output budgets, and handlers sharing the same service layer used by the human UI.
8. Demo fixtures: before/after results genuinely exercise both fixed and still-present outcomes.
9. Security headers: required baseline emitted on HTML and JSON-specific safety headers on API responses.

### Integration checks

- `npm run check`
- `npm test`
- `npm run build`
- Local Wrangler request against `/api/audit` using a controlled public fixture server or mocked fetch boundary.
- Browser smoke test with `chrome://flags/#enable-webmcp-testing` enabled.
- `document.modelContext.getTools()` confirms exactly five tools, correct names and annotations.
- Execute all five tools manually through `document.modelContext.executeTool()`.
- Natural-language agent test confirms correct tool selection for at least: run an audit, list errors, inspect one finding, select a bounded scope, and verify.
- Lighthouse Registered WebMCP tools audit shows the expected tools.
- Mobile and desktop visual checks.

### Challenge verification

Before submission:

1. Deploy the exact `main` commit.
2. Re-test all five tools on the public URL.
3. Test demo mode from a clean browser session.
4. Confirm no account/credential setup is required for judges.
5. Record the demo from the production URL.
6. Verify public repository, MIT license, challenge scope document, and README are accessible anonymously.

## Delivery Sequence

1. Repository foundation, tests, CI, and deployment contract.
2. URL policy and bounded fetch service.
3. Deterministic audit analyzer.
4. Shared browser state and human UI.
5. WebMCP tool schemas/handlers/registration.
6. Deterministic demo and verification loop.
7. Security headers/rate limiting/hardening.
8. Documentation and full production verification.

Each sequence step should be independently testable and committed separately where practical.

## Acceptance Criteria

The build is complete only when all of the following are true:

- Public repository builds from a clean clone with documented commands.
- Production URL works without login.
- Live URL audit rejects unsafe inputs and returns bounded deterministic findings.
- Exactly five WebMCP tools are registered through `document.modelContext`.
- Tool schemas and annotations match this document.
- External page-derived content is marked untrusted and bounded before reaching tool output.
- Both human UI actions and WebMCP actions mutate the same visible state model.
- Demo mode completes the entire audit-to-verification loop without network changes.
- Verification never accepts an arbitrary replacement target URL from the agent.
- No tool can modify the audited website or any external account.
- CI passes typecheck, tests, and build.
- Security headers and rate limiting are verified in the target runtime.
- README, security doc, architecture doc, challenge scope, and MIT license are present.
- A judge can understand and exercise the core loop in under three minutes.
