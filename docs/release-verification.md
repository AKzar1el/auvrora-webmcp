# Release verification

Verified on **August 29, 2026** for the OpenAI WebMCP Challenge.

## Production artifact

- Live URL: <https://loopfix-webmcp.tomi-seregi99.workers.dev>
- Cloudflare Worker: `loopfix-webmcp`
- Deployed Worker version: `3650c7b0-43bc-4c34-aa06-43e9c7989bb0`
- Runtime source commit: `14d61877d05aee83fb9d0b11ffb6a8e7f98af156`

Subsequent repository commits add tests, WebMCP evaluation fixtures, and documentation only; they do not change the deployed runtime code.

## Clean build gate for the deployed runtime

The final hardened runtime source was verified repeatedly before and after integration, and again by the production deployment runner:

- `npm ci`: success; npm reported **0 vulnerabilities**.
- `wrangler types --check`: generated Worker types current.
- `astro check`: **0 errors, 0 warnings, 0 hints**.
- Vitest: **17 files / 99 tests passed**.
- `astro build` with `@astrojs/cloudflare`: success.
- Wrangler 4.127.1 deployment: success.

The production Worker reported the expected bindings:

- `AUDIT_RATE_LIMITER`: 10 requests / 60 seconds.
- `ASSETS`: static assets binding.

## Final hardening regression coverage

The pre-submission sweep added focused regression tests for issues reproduced against the prior build:

- stale overlapping audit requests cannot replace newer audit state;
- verification cannot attach to a changed or newly superseded audit/fix scope;
- hexadecimal numeric HTML character references are normalized before heuristic text-length checks;
- quoted `>` characters no longer truncate valid HTML start tags;
- multiple robots meta tags are combined and the standard `none` directive is treated as noindex-equivalent;
- LoopFix's own title and canonical metadata stay consistent with its deterministic audit rules.

No new framework, runtime dependency, authentication system, database, AI backend, crawler scope, or WebMCP tool was introduced by the hardening sweep.

## Production HTTP, security, and stress verification

The freshly deployed production URL passed the following checks:

- `/`: HTTP 200 on the first readiness attempt.
- Final page title and production canonical URL present.
- `Content-Security-Policy` header present.
- `Permissions-Policy` header present.
- `X-Content-Type-Options: nosniff` present.
- `Referrer-Policy: no-referrer` present.
- `X-Frame-Options: DENY` present.
- LoopFix audited its own production URL with **zero deterministic findings**.
- Malformed JSON was rejected.
- A non-JSON form-style POST was rejected by Astro's CSRF protection with HTTP 403.
- An oversized request body was rejected.
- Requests containing undeclared JSON properties were rejected.
- Literal loopback/link-local targets including `127.0.0.1`, `169.254.169.254`, and `[::1]` were rejected with `private_url`.
- 25 parallel requests to `/` completed **25/25 with HTTP 200**.
- 20 parallel production audit requests completed **20/20 with HTTP 200** and no 5xx responses.

These checks exercise the public runtime rather than only a local or CI build.

## Native WebMCP browser verification

The hardened production URL was tested with **Google Chrome 151.0.7922.173** with WebMCP testing enabled.

Chrome discovered exactly these five page tools through `document.modelContext`:

1. `run_audit`
2. `list_findings`
3. `inspect_finding`
4. `set_fix_scope`
5. `verify_fix_scope`

Each tool was executed against the production page through native `document.modelContext.executeTool()` and passed:

- `run_audit`: passed against `https://example.com/`.
- `list_findings`: returned deterministic findings from the active audit.
- `inspect_finding`: returned the requested current finding.
- `set_fix_scope`: updated the visible one-finding fix scope.
- `verify_fix_scope`: re-audited the same canonical URL and returned the selected finding's verification result.

### Chrome compatibility note

Current Chrome manual `executeTool()` inputs are provided as a JSON string. During production browser verification, Chrome 151 also did not provide the tool callback's execution-options argument on this manual execution path, although current WebMCP guidance documents an execution `AbortSignal`.

LoopFix therefore treats callback options as optional while continuing to propagate `AbortSignal` whenever an agent/browser supplies one. Regression tests cover both the absent-options behavior and the documented signal-forwarding path.

## Post-deployment WebMCP eval verification

An eval-only hardening pass added a reproducible agent-facing dataset without changing the five production tools, server behavior, Cloudflare configuration, or deployed runtime bundle.

The repository now contains **10 natural-language WebMCP eval cases** covering:

- direct audit/tool-selection requests;
- ambiguous severity and scope requests;
- multi-step audit → inspect → scope → verify journeys;
- inspect-before-mutate ordering;
- recovery from an empty browser state; and
- one no-tool refusal for an unsupported website-edit/deploy request.

A static `evals/tools.json` snapshot contains the five public tool names, descriptions, and input schemas. Repository tests compare that snapshot with the production WebMCP definitions so schema or description drift cannot silently invalidate the eval corpus. Additional guards validate eval structure and mocked `list_findings` output coherence.

After the final eval fixture corrections, normal repository CI reported:

- `npm ci`: success; LoopFix's dependency tree reported **0 vulnerabilities**;
- `wrangler types --check`: generated Worker types current;
- `astro check`: **45 files, 0 errors, 0 warnings, 0 hints**;
- Vitest: **18 files / 104 tests passed**;
- `astro build` with `@astrojs/cloudflare`: success.

### Live expected-call trajectory smoke

GoogleChromeLabs' experimental `webmcp-evals` CLI was executed from pinned upstream commit `97e6fbe83fc3f2e3c6df2198b962dd2ad59cb924` in a disposable GitHub Actions environment. It was not added to LoopFix's application dependency graph.

The nine eval cases that contain required tool calls were executed against the public production Worker through the upstream Chrome smoke runner. Because LoopFix intentionally rate-limits audit starts to 10 per minute per derived key, the cases were split across two limiter windows rather than weakening production abuse controls.

Final result:

- batch A: **12/12 required steps passed** across five cases;
- batch B: **17/17 required steps passed** across four cases;
- combined: **29/29 required live WebMCP tool steps passed**.

The live trajectory run exercised all five LoopFix tools, including one-finding verification, two-finding verification, ambiguous selection, and recovery from empty state.

The tenth eval uses `expectedCall: null` to assert that an agent should not invent a website-edit/deploy capability. The deterministic upstream smoke command cannot evaluate the intentional absence of a call, so that case remains part of the optional probabilistic model-eval dataset rather than being converted into an artificial tool invocation.

LoopFix does **not** publish a probabilistic model tool-selection pass rate because no fixed model/backend/run-count benchmark has been executed and recorded. The repository publishes the reproducible eval inputs and deterministic live trajectory evidence instead of fabricating a model result.

See [webmcp-evals.md](webmcp-evals.md) for the exact dataset, pinned smoke procedure, and optional model-eval commands.

## Security scope confirmed

The production build does not:

- modify audited websites;
- accept user credentials or arbitrary request headers;
- accept private/local audit targets;
- allow an agent to choose a replacement verification URL;
- expose raw fetched HTML as WebMCP output;
- use an LLM backend;
- persist accounts or audit data;
- expose its WebMCP tools cross-origin.

The analyzer is intentionally a small deterministic audit scanner rather than a full browser-conformance parser. It does not currently inspect `X-Robots-Tag` response headers or perform multi-page crawling.

See [security.md](security.md) for the complete threat boundary and known limitations.
