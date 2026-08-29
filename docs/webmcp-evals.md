# WebMCP agent evaluations

LoopFix ships a small evaluation dataset for the agent-facing WebMCP contract in `evals/`.

The goal is deliberately narrower than benchmarking a language model: detect regressions in tool naming, schema drift, tool-selection clarity, ordering, and the human-agent remediation journey without changing the production runtime.

The dataset follows Chrome's current WebMCP evaluation guidance and the JSON format used by GoogleChromeLabs `webmcp-evals`.

## Files

- `evals/tools.json` — static snapshot of the five public WebMCP tool names, descriptions, and input schemas for schema-only model evals.
- `evals/webmcp-evals.json` — ten natural-language cases covering direct requests, ambiguous intent, multi-step journeys, recovery from missing state, and a request that should not invoke any LoopFix tool.
- `test/webmcp-evals.test.ts` — deterministic guard that verifies the tool snapshot still matches the production WebMCP contract and that the eval suite stays structurally valid.

The static tool snapshot is intentionally duplicated for compatibility with external eval tooling. CI compares it with the production tool definitions so the copy cannot silently drift.

## Coverage

The ten cases exercise these behaviors:

1. direct public-page audit;
2. audit followed by finding discovery;
3. finding inspection using an ID returned by the audit workflow;
4. ambiguous severity-based prioritization;
5. ambiguous scope selection with an optional inspection step;
6. full audit → list → inspect → scope → verify journey;
7. multi-finding scope and verification;
8. inspect-before-mutate ordering;
9. recovery when verification is requested from an empty browser state;
10. refusal to invent an unsupported website-edit/deploy capability.

The example target is `https://example.com/`, a stable public documentation domain. The evals use LoopFix's deterministic finding IDs where a concrete ID is needed.

## Deterministic repository gate

`npm test` validates the eval artifacts together with the rest of the application tests. This requires no model API key and is suitable for normal CI.

## Deterministic live smoke

GoogleChromeLabs `webmcp-evals` includes a `smoke` mode that executes the authored `expectedCall` trajectory directly against a live WebMCP page without an LLM or API key. This verifies that the eval trajectories remain executable against the deployed application.

Using the GoogleChromeLabs repository at a reviewed commit:

```bash
git clone https://github.com/GoogleChromeLabs/webmcp-tools.git
cd webmcp-tools
git checkout 97e6fbe83fc3f2e3c6df2198b962dd2ad59cb924
cd webmcp-evals
npm ci
npm run build
node dist/bin/webmcp-evals.js --chrome-channel chrome smoke \
  -u https://loopfix-webmcp.tomi-seregi99.workers.dev \
  -e /absolute/path/to/loopfix-mcp/evals/webmcp-evals.json \
  -v
```

`webmcp-evals` is experimental upstream tooling, so LoopFix does not add it as a production dependency.

## Probabilistic model evals

Chrome recommends model-driven evals in addition to deterministic tests because agent tool selection is probabilistic. Run these deliberately rather than in the default CI gate: they require a selected model/backend, may cost money, and results can vary across runs.

Schema-only selection eval:

```bash
node dist/bin/webmcp-evals.js local \
  -t /absolute/path/to/loopfix-mcp/evals/tools.json \
  -e /absolute/path/to/loopfix-mcp/evals/webmcp-evals.json \
  --backend <backend> \
  --model <model> \
  --runs 5 \
  --reporter console json html
```

Live browser journey eval:

```bash
node dist/bin/webmcp-evals.js --chrome-channel chrome browser \
  -u https://loopfix-webmcp.tomi-seregi99.workers.dev \
  -e /absolute/path/to/loopfix-mcp/evals/webmcp-evals.json \
  --backend <backend> \
  --model <model> \
  --runs 5 \
  --max-steps 8 \
  --reporter console json html
```

Configure only the environment variable required by the backend you choose. Do not commit model credentials or generated `.evals/` reports containing sensitive data.

## Interpreting results

A model failure is evidence to inspect, not a reason to add model-specific prompt hacks automatically. First classify whether the failure is caused by:

- an unclear or overlapping tool description;
- incorrect schema semantics;
- missing information in an earlier tool result;
- invalid tool ordering;
- a state precondition the agent could not infer;
- or normal model variance.

Changes to the production tool contract should be justified by repeated failures across realistic cases, then covered by the existing deterministic WebMCP contract tests.

LoopFix does not publish a model-selection pass rate until an actual model/backend/runs configuration has been executed and recorded. The committed suite is the reproducible evaluation input, not a fabricated benchmark result.
