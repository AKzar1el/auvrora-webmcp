# Release verification

Verified on **August 28, 2026** for the OpenAI WebMCP Challenge.

## Production artifact

- Live URL: <https://loopfix-webmcp.tomi-seregi99.workers.dev>
- Cloudflare Worker: `loopfix-webmcp`
- Deployed Worker version: `3c7dbaf0-3d85-483b-8e01-9bba463e9fb1`
- Runtime code verification commit: `2916e943a2c43cf64cdfd32dbb1a2f946170669f`

Documentation-only commits after that code verification do not change the deployed runtime artifact.

## Clean build gate

The production deployment runner executed the repository's complete verification gate before publishing:

- `npm ci`: success; npm reported **0 vulnerabilities**.
- `wrangler types --check`: generated Worker types current.
- `astro check`: **0 errors, 0 warnings, 0 hints**.
- Vitest: **12 files / 89 tests passed**.
- `astro build` with `@astrojs/cloudflare`: success.
- Wrangler 4.127.1 deployment: success.

The Worker reported the expected bindings:

- `AUDIT_RATE_LIMITER`: 10 requests / 60 seconds.
- `ASSETS`: static assets binding.

## Production HTTP and security smoke

The freshly deployed production URL passed the following checks:

- `/`: HTTP 200 on the first readiness attempt.
- Page title contains `LoopFix WebMCP`.
- `Content-Security-Policy` header present.
- `Permissions-Policy` header present.
- `POST /api/audit` with `https://example.com/`: HTTP 200 with the expected canonical URL and a findings array.
- `POST /api/audit` with `http://127.0.0.1/`: HTTP 400 with `error: private_url`.

These checks verify the public runtime, not only a local build.

## Native WebMCP browser verification

The deployed production URL was tested with **Google Chrome 151.0.7922.173** with WebMCP testing enabled.

Chrome discovered exactly these five page tools through `document.modelContext`:

1. `run_audit`
2. `list_findings`
3. `inspect_finding`
4. `set_fix_scope`
5. `verify_fix_scope`

Each tool was then executed against the production page through native `document.modelContext.executeTool()` and passed:

- `run_audit`: passed against `https://example.com/`.
- `list_findings`: returned deterministic findings from the active audit.
- `inspect_finding`: returned the requested current finding.
- `set_fix_scope`: updated the visible one-finding fix scope.
- `verify_fix_scope`: re-audited the same canonical URL and returned the selected finding's verification result.

### Chrome compatibility note

Chrome's current manual `executeTool()` API accepts tool arguments as a JSON string. During production browser verification, Chrome 151 also did not provide the tool callback's execution-options argument on this manual execution path, although current WebMCP guidance documents an execution `AbortSignal`.

LoopFix therefore treats callback options as optional while continuing to propagate `AbortSignal` whenever an agent/browser supplies one. Two regression tests cover the absent-options behavior, and the existing signal-forwarding tests cover the documented path.

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

See [security.md](security.md) for the complete threat boundary and known limitations.
