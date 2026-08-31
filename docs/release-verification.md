# Release verification

Verified on **August 31, 2026** for the OpenAI WebMCP Challenge.

## Production artifact

- Product: **Auvrora WebMCP**
- Live URL: <https://auvrora-webmcp.tomi-seregi99.workers.dev>
- Cloudflare Worker: `auvrora-webmcp`
- Deployed Worker version: `dddbe4bc-6477-42f7-9a31-d4bf2655ca69`
- Runtime source commit: `8ee2e5a989895601b9dc4b01bab75929ce16d32e`
- Runtime stack: Astro + TypeScript on Cloudflare Workers

The deployment runner used the source from the runtime commit above. Its disposable cutover branch contained only verification/credential-transport workflow files in addition to that source; those operational files are not part of the production application.

## Clean build gate

The final Auvrora runtime source passed the complete repository gate before deployment and again inside the cutover runner:

- `npm ci`: success; npm reported **0 vulnerabilities**.
- `wrangler types --check`: generated Worker types current.
- `astro check`: **46 files, 0 errors, 0 warnings, 0 hints**.
- Vitest: **19 files / 107 tests passed**.
- `astro build` with `@astrojs/cloudflare`: success.
- Wrangler 4.127.1 deployment: success.

The production Worker reported the expected bindings:

- `AUDIT_RATE_LIMITER`: 10 requests / 60 seconds.
- `ASSETS`: static assets binding.

## Rename and brand-consistency verification

The LoopFix → Auvrora migration was treated as a bounded rename rather than a feature change. No WebMCP tool name, input schema, application capability, audit rule, API route, security policy, or workflow behavior was intentionally changed.

A dedicated regression gate verifies that:

- no stale `LoopFix`, old Worker URL, old repository slug, or `loopfix-client` reference remains in the public application/docs/eval tree;
- package metadata uses `auvrora-webmcp`;
- Wrangler deploys `auvrora-webmcp`;
- README links point to the Auvrora Worker and repository;
- the visible header uses the Auvrora name and `AU` mark; and
- brand-specific client/spec/plan paths use Auvrora naming.

The public WebMCP tool surface remains exactly:

1. `run_audit`
2. `list_findings`
3. `inspect_finding`
4. `set_fix_scope`
5. `verify_fix_scope`

## Earlier hardening regression coverage

The pre-submission hardening sweep remains part of the test suite. It covers, among other boundaries:

- stale overlapping audit requests cannot replace newer audit state;
- verification cannot attach to a changed or newly superseded audit/fix scope;
- hexadecimal numeric HTML character references are normalized before heuristic text-length checks;
- quoted `>` characters do not truncate valid HTML start tags;
- multiple robots meta tags are combined and the standard `none` directive is treated as noindex-equivalent;
- Auvrora's own title and canonical metadata stay consistent with its deterministic audit rules; and
- browser/WebMCP callback compatibility preserves cancellation when an `AbortSignal` is supplied while tolerating the manual Chrome path that omits callback options.

## Production HTTP and security verification

The freshly deployed Auvrora URL passed live checks against the public Cloudflare Worker:

- `/`: HTTP 200.
- Production HTML contains **Auvrora** and no stale **LoopFix** branding.
- `Content-Security-Policy` header present.
- `Permissions-Policy` header present.
- `X-Content-Type-Options: nosniff` present.
- `Referrer-Policy: no-referrer` present.
- `X-Frame-Options: DENY` present.
- Auvrora audited its own production URL with **zero deterministic findings**.
- A literal loopback target (`127.0.0.1`) was rejected with HTTP 400 and `private_url`.

The existing security boundary also retains bounded request/body/redirect handling, public-only URL policy, redirect revalidation, rate limiting, and untrusted-content WebMCP annotations. See [security.md](security.md).

## Native WebMCP browser and trajectory verification

The Auvrora deployment was exercised through GoogleChromeLabs' pinned `webmcp-evals` Chrome smoke runner using upstream commit `97e6fbe83fc3f2e3c6df2198b962dd2ad59cb924`.

The nine eval cases that contain executable calls were split across two limiter windows rather than weakening Auvrora's production 10-audit/minute abuse boundary.

Final result on **August 31, 2026**:

- batch A: **12/12 required steps passed** across five cases;
- batch B: **17/17 required steps passed** across four cases;
- combined: **29/29 required live WebMCP tool steps passed**.

The run exercised all five public WebMCP tools on the new Auvrora URL, including:

- direct audit and finding discovery;
- evidence inspection;
- ambiguous severity/scoping requests;
- one-finding scope verification;
- two-finding scope verification; and
- recovery from an empty browser state.

Tool outputs used the new Auvrora branding where product text is returned.

The tenth committed eval is an intentional `expectedCall: null` refusal for unsupported website-edit/deploy behavior. The deterministic smoke runner cannot score an intentional absence of a call, so that case remains part of the optional probabilistic model-eval dataset rather than being converted into a fake invocation.

Auvrora does **not** publish a probabilistic model-selection pass rate because no fixed model/backend/run-count benchmark has been executed and recorded. The repository publishes reproducible eval inputs and deterministic live trajectory evidence instead.

See [webmcp-evals.md](webmcp-evals.md) for the exact dataset and reproduction procedure.

## Security scope confirmed

The production build does not:

- modify audited websites;
- accept user credentials or arbitrary request headers;
- accept private/local audit targets;
- allow an agent to choose a replacement verification URL;
- expose raw fetched HTML as WebMCP output;
- use an LLM backend;
- persist accounts or audit data; or
- expose its WebMCP tools cross-origin.

The analyzer is intentionally a small deterministic audit scanner rather than a full browser-conformance parser. It does not inspect `X-Robots-Tag` response headers or perform multi-page crawling.

## Cutover policy

The previous `loopfix-webmcp` Worker was intentionally left available as a rollback target while the Auvrora repository/production migration was verified. It should be retired only after the Auvrora source has landed on `main`, the GitHub repository rename has completed, and the new canonical repository/live URLs have been checked.
