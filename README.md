# LoopFix WebMCP

**A human-agent remediation loop for deterministic technical SEO audits.** A person keeps the audit, scope, and verification state visible in the browser while an agent uses five native WebMCP tools against that same state.

Built as a new open-source entry for the **OpenAI WebMCP Challenge (August–September 2026)**.

> **Live demo:** pending production deployment. This line will be replaced with the verified Worker URL before submission.

## The loop

`Audit → Inspect → Scope → Implement outside LoopFix → Re-audit → Verify`

LoopFix does not modify the target website, run an AI backend, accept credentials, or expose fetched HTML to the agent. Its initial audit is deliberately small and deterministic.

| WebMCP tool | Purpose |
| --- | --- |
| `run_audit` | Run one bounded public-page audit and make it the active visible audit. |
| `list_findings` | List compact findings from the active audit. |
| `inspect_finding` | Inspect bounded evidence and guidance for one current finding. |
| `set_fix_scope` | Set one to ten current finding IDs as the visible fix scope. |
| `verify_fix_scope` | Re-audit the same canonical URL and compare the selected finding IDs. |

## Run locally

Requirements: **Node.js 22+** and npm.

```bash
git clone https://github.com/AKzar1el/loopfix-mcp.git
cd loopfix-mcp
npm ci
npm run dev
```

Run the complete local verification gate with:

```bash
npm run verify
```

## Test WebMCP

The challenge supports two judge/test paths:

1. **ChatGPT desktop app:** open LoopFix in ChatGPT's built-in browser. When site tools are available for the account, ChatGPT discovers the tools provided by the page.
2. **Google Chrome 149+:** open `chrome://flags/#enable-webmcp-testing`, enable WebMCP testing, relaunch Chrome, then open LoopFix.

In Chrome DevTools you can inspect the current page tools with:

```js
await document.modelContext.getTools()
```

The human UI remains fully usable when WebMCP is unavailable.

## Deterministic audit scope

The challenge build checks 13 bounded signals: title presence/heuristic length, meta-description presence/heuristic length, H1 presence/count, canonical link, viewport metadata, document language, images missing `alt`, and `noindex`.

The numeric title/description ranges are **LoopFix heuristics, not Google ranking requirements**. Google documents that title links and snippets may be truncated or generated differently depending on context and device width.

## Security model

The audit endpoint accepts only one public HTTP(S) URL, manually revalidates every redirect, blocks literal private/reserved address classes and local hostnames, enforces standard ports, limits redirects/time/body size, never forwards user cookies or arbitrary headers, and never executes fetched page JavaScript.

Page-derived results are exposed to WebMCP with `untrustedContentHint: true`; read-only tools also declare `readOnlyHint: true`. See [docs/security.md](docs/security.md) for the full threat boundary and known limitations.

## Architecture

Astro + TypeScript run on Cloudflare Workers. The browser owns ephemeral workflow state. Both human controls and WebMCP tool handlers delegate to the same application controller; the server owns only URL policy, bounded retrieval, deterministic analysis, and coarse abuse protection.

See [docs/architecture.md](docs/architecture.md) and [docs/challenge-scope.md](docs/challenge-scope.md).

## License

[MIT](LICENSE) © 2026 Tomi Šeregi.
