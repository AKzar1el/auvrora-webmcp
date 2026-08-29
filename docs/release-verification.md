# Release verification

Verified on **August 29, 2026** for the OpenAI WebMCP Challenge.

## Production artifact

- Live URL: <https://loopfix-webmcp.tomi-seregi99.workers.dev>
- Cloudflare Worker: `loopfix-webmcp`
- Deployed Worker version: `3650c7b0-43bc-4c34-aa06-43e9c7989bb0`
- Runtime source commit: `14d61877d05aee83fb9d0b11ffb6a8e7f98af156`

Documentation-only commits after that source commit do not change the deployed runtime artifact.

## Clean build gate

The final hardened source was verified repeatedly before and after integration, and again by the production deployment runner:

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
