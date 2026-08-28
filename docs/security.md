# Security model

LoopFix accepts an attacker-influenced public URL and exposes part of the resulting deterministic analysis to an AI agent. Those are the two primary trust boundaries.

## URL and SSRF boundary

The server accepts only `http:` and `https:` targets on standard ports. It rejects embedded credentials, localhost/non-public hostname classes, and literal IPv4/IPv6 ranges that are loopback, private, link-local, documentation/reserved, multicast, or otherwise unsuitable for a public-page audit.

Redirects are handled manually. Every redirect target is parsed and checked again before another request is issued. Redirect loops and chains beyond three hops are rejected.

The Worker also enables Cloudflare's `global_fetch_strictly_public` compatibility flag, which makes global `fetch()` behave as if it originates on the public Internet. This is defense in depth; the application still performs its own URL and redirect validation.

### DNS rebinding limitation

Application-level hostname validation cannot prove that a public hostname will always resolve to a public address. LoopFix therefore does **not** claim complete DNS-rebinding prevention from string validation alone. Cloudflare Workers' network/runtime boundary provides defense in depth, while the application independently rejects literal private targets and suspicious hostname classes.

LoopFix never accepts target credentials, arbitrary request headers, cookies, request bodies, or a user-selected verification URL.

## Retrieval limits

- request JSON body: 4 KiB maximum;
- URL: 2,048 characters maximum;
- redirects: three maximum;
- network deadline: 12 seconds per request, including response-body consumption;
- fetched HTML body: 2 MiB maximum;
- accepted content types: `text/html` and `application/xhtml+xml`.

The fetcher does not execute target JavaScript. It requests HTML with a transparent LoopFix user agent and does not forward browser authentication state.

## Untrusted page content

Fetched HTML is treated as untrusted data. The analyzer strips comments and complete script/style blocks before its limited metadata inspection. It generates its own short evidence strings rather than returning body text or raw markup.

All tools whose output can contain target-derived data declare `untrustedContentHint: true`. `list_findings` and `inspect_finding` also declare `readOnlyHint: true`. Tool outputs are length-bounded, and runtime guards reject input outside the published schemas.

No WebMCP tool uses `exposedTo`; the project relies on the default same-origin `tools` permission boundary.

## Human control

`set_fix_scope` changes only ephemeral visible browser state. LoopFix does not write code, modify a website, deploy changes, authenticate to third-party accounts, or execute generated instructions. The human decides what is actually implemented outside LoopFix.

## Browser response headers

HTML responses receive a restrictive baseline including CSP, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, and a Permissions Policy that denies unrelated sensitive features while allowing WebMCP `tools` for self.

The CSP is intentionally narrow and will only be adjusted if production browser verification proves a specific Astro-generated resource requires it. Wildcard sources are not used.

## Rate limiting and privacy

The production Worker uses Cloudflare's Rate Limiting binding at a target of 10 audit starts per minute per derived non-raw key. The raw `CF-Connecting-IP` value is not used as the limiter key; LoopFix hashes the endpoint name, UTC day, and address before calling the binding.

This transformation reduces propagation of the raw address into the limiter key, but it is **not cryptographic anonymization**: IP addresses have a small enough search space that a deterministic hash can potentially be guessed. The key is used only as coarse abuse control; application code does not persist or log the raw address or derived key.

This limiter is not identity, billing, or exact accounting. Shared public IP addresses may group unrelated users, and Cloudflare's Workers Rate Limiting API is intentionally approximate and location-scoped.

## Data retention

LoopFix has no database. Audit state and selected scope live only in the active browser session. The application does not intentionally retain fetched HTML or submitted URLs. Cloudflare/platform operational logs remain subject to the hosting account's platform configuration.
