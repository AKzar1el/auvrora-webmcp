# LoopFix WebMCP

**A human-agent remediation loop for deterministic technical SEO audits.** A person keeps the audit, scope, and verification state visible in the browser while an agent uses five native WebMCP tools against that same state.

Built as a new open-source entry for the **OpenAI WebMCP Challenge (August–September 2026)**.

> **Live demo:** https://loopfix-webmcp.tomi-seregi99.workers.dev

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

Current Chrome expects manual `executeTool()` inputs as a JSON string. For example:

```js
const tool = (await document.modelContext.getTools()).find(({ name }) => name === "run_audit");
await document.modelContext.executeTool(tool, JSON.stringify({ url: "https://example.com/" }));
```

The deployed build was verified against **Google Chrome 151.0.7922.173** with all five native WebMCP tools executed successfully. The human UI remains fully usable when WebMCP is unavailable.

## Agent evals

LoopFix also ships **10 natural-language WebMCP eval cases** covering direct tool selection, ambiguous intent, multi-step journeys, recovery from empty state, and a no-tool refusal. `evals/tools.json` snapshots the public tool contract for schema-only model evals, while CI verifies that snapshot against the production tool definitions so it cannot silently drift.

The nine executable trajectories were additionally run against the public Worker with GoogleChromeLabs' pinned `webmcp-evals` smoke runner and passed **29/29 required live WebMCP tool steps**. The tenth case is an intentional no-tool refusal and remains in the probabilistic model-eval suite rather than being converted into a fake smoke call.

Model runs are intentionally not part of the default CI gate because they require a chosen backend, can incur cost, and are non-deterministic.

See [docs/webmcp-evals.md](docs/webmcp-evals.md) for the dataset, pinned-tooling smoke procedure, and model-eval workflow.

## Deterministic audit scope

The challenge build checks 13 bounded signals: title presence/heuristic length, meta-description presence/heuristic length, H1 presence/count, canonical link, viewport metadata, document language, images missing `alt`, and `noindex`.

The numeric title/description ranges are **LoopFix heuristics, not Google ranking requirements**. Google documents that title links and snippets may be truncated or generated differently depending on context and device width.

## Security model

The audit endpoint accepts only one public HTTP(S) URL, manually revalidates every redirect, blocks literal private/reserved address classes and local hostnames, enforces standard ports, limits redirects/time/body size, never forwards user cookies or arbitrary headers, and never executes fetched page JavaScript.

Page-derived results are exposed to WebMCP with `untrustedContentHint: true`; read-only tools also declare `readOnlyHint: true`. See [docs/security.md](docs/security.md) for the full threat boundary and known limitations.

## Architecture

Astro + TypeScript run on Cloudflare Workers. The browser owns ephemeral workflow state. Both human controls and WebMCP tool handlers delegate to the same application controller; the server owns only URL policy, bounded retrieval, deterministic analysis, and coarse abuse protection.

See [docs/architecture.md](docs/architecture.md), [docs/challenge-scope.md](docs/challenge-scope.md), [docs/webmcp-evals.md](docs/webmcp-evals.md), and [docs/release-verification.md](docs/release-verification.md).

## License

[MIT](LICENSE) © 2026 Tomi Šeregi.
